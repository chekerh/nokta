import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { evaluateUiGates } from '../../compiler/lib/ui-gates.mjs';

// Nokta's "fleet": the set of projects being driven by an external agent
// harness (opencode TUI or freebuff). This is intentionally JSON on disk —
// the daemon can restart without losing its fleet.
//
// The only headless provider right now is opencode: `fleet.run()` spawns
// `opencode run --print` in the project's cwd and captures the finished
// transcript. freebuff has no headless mode, so it is tracked + listed only.

const HEADLESS_PROVIDERS = new Set(['opencode']);

function fleetPath(projectRoot) {
  return path.join(projectRoot, '.nokta', 'fleet.json');
}

function queuePath(projectRoot) {
  return path.join(projectRoot, '.nokta', 'fleet-queue.json');
}

async function loadQueue(projectRoot) {
  try {
    const raw = await fs.readFile(queuePath(projectRoot), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function saveQueue(projectRoot, items) {
  await fs.mkdir(path.dirname(queuePath(projectRoot)), { recursive: true });
  await fs.writeFile(queuePath(projectRoot), JSON.stringify({ items }, null, 2));
}

async function loadFleet(projectRoot) {
  const file = fleetPath(projectRoot);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return { sessions: [] };
  }
}

async function saveFleet(projectRoot, data) {
  const file = fleetPath(projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export class FleetTransport {
  constructor(projectRoot = process.cwd(), { log } = {}) {
    this.projectRoot = projectRoot;
    this.log = log;
  }

  async list() {
    return (await loadFleet(this.projectRoot)).sessions;
  }

  async register({ project, provider = 'opencode', pid, port, cwd }) {
    const data = await loadFleet(this.projectRoot);
    const existing = data.sessions.findIndex((s) => s.project === project && s.provider === provider);
    const entry = {
      project,
      provider,
      pid: pid ?? null,
      port: port ?? null,
      cwd: cwd ?? path.resolve(this.projectRoot, project || '.'),
      lastError: null,
      startedAt: existing >= 0 ? data.sessions[existing].startedAt : new Date().toISOString(),
    };
    if (existing >= 0) data.sessions[existing] = entry;
    else data.sessions.push(entry);
    await saveFleet(this.projectRoot, data);
    return entry;
  }

  async forget(project, provider) {
    const data = await loadFleet(this.projectRoot);
    const before = data.sessions.length;
    data.sessions = data.sessions.filter(
      (s) => !(s.project === project && (!provider || s.provider === provider)),
    );
    await saveFleet(this.projectRoot, data);
    return before - data.sessions.length;
  }

  async run(project, prompt, { provider = 'opencode', cwd, timeoutMs = 120000 } = {}) {
    if (!HEADLESS_PROVIDERS.has(provider)) {
      const err = new Error(
        `Provider "${provider}" has no headless mode; switch the session to opencode or capture its terminal output via tmux`,
      );
      err.code = 'E_NO_HEADLESS';
      throw err;
    }
    const workingDir = cwd || path.resolve(this.projectRoot, project || '.');
    await fs.mkdir(workingDir, { recursive: true });
    const data = await loadFleet(this.projectRoot);
    const session = data.sessions.find((s) => s.project === project && s.provider === provider);

    // Prefer attaching to a live opencode server for this project (the only way
    // to talk to a session that is already running). `session.port` is the
    // port of `opencode serve --port N` started in that project's directory.
    let argv;
    if (provider === 'opencode' && session?.port) {
      argv = [
        'run',
        '--print',
        prompt,
        '--attach',
        `http://127.0.0.1:${session.port}`,
        '--dir',
        workingDir,
      ];
    } else {
      argv = ['run', '--print', prompt];
    }
    if (process.env.NOKTA_FLEET_OPENCODE_MODEL) argv.push('--model', process.env.NOKTA_FLEET_OPENCODE_MODEL);
    const child = spawn('opencode', argv, {
      cwd: workingDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const kill = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', () => resolve(-1));
    });
    clearTimeout(kill);
    if (session) {
      session.lastOutputAt = new Date().toISOString();
      if (exitCode !== 0) session.lastError = `exit ${exitCode}: ${stderr.slice(-300)}`;
      else session.lastError = null;
      await saveFleet(this.projectRoot, data);
    }
    return { exitCode, stdout, stderr, project, provider, cwd: workingDir };
  }

  // Build the prompt bundle that actually gets sent to the agent for this
  // project. Conserves goal/branch discovered from the live process list, and
  // appends the current UI-gate health so the agent knows its constraints.
  async plan(project, prompt, { provider = 'opencode' } = {}) {
    const sessions = await loadFleet(this.projectRoot);
    const entry = sessions.sessions.find((s) => s.project === project && s.provider === provider);
    const cwd = entry?.cwd ? path.resolve(entry.cwd) : path.resolve(this.projectRoot, project || '.');
    const discovered = discoverAgents().find(
      (d) => path.resolve(d.projectRoot) === cwd || cwd.startsWith(path.resolve(d.projectRoot) + path.sep),
    );
    const uiResults = cwd && existsSync(path.join(cwd, 'daemon', 'public'))
      ? evaluateUiGates(cwd)
      : [];
    const gateLines = uiResults
      .filter((r) => r.status !== 'pass')
      .map((r) => `- [${r.status.toUpperCase()}] ${r.gate}: ${r.message || ''}`)
      .join('\n');
    const bundle = [
      `Project: ${cwd}`,
      `Provider: ${provider}`,
      `Discovered branch: ${discovered?.branch || 'unknown'}`,
      `Discovered goal: ${discovered?.goal || '(not declared)'}`,
      gateLines ? `Current UI gate failures to address first:\n${gateLines}` : 'Current UI gates: pass',
      '',
      `Task: ${prompt}`,
    ].join('\n');
    return {
      project,
      provider,
      cwd,
      goal: discovered?.goal || null,
      branch: discovered?.branch || null,
      uiGates: uiResults,
      prompt: bundle,
      createdAt: new Date().toISOString(),
    };
  }

  async enqueue(plan) {
    const items = await loadQueue(this.projectRoot);
    plan.id = plan.id || `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    plan.status = 'pending';
    items.push(plan);
    await saveQueue(this.projectRoot, items);
    return plan;
  }

  async queueList() {
    return loadQueue(this.projectRoot);
  }

  async sendQueued(id) {
    const items = await loadQueue(this.projectRoot);
    const entry = items.find((i) => i.id === id);
    if (!entry) throw new Error(`Queued prompt ${id} not found`);
    entry.status = 'running';
    await saveQueue(this.projectRoot, items);
    try {
      const res = await this.run(entry.project, entry.prompt, { provider: entry.provider, cwd: entry.cwd });
      entry.status = res.exitCode === 0 ? 'done' : 'failed';
      entry.lastRunAt = new Date().toISOString();
      entry.lastExitCode = res.exitCode;
      entry.lastStdout = res.stdout.slice(-2000);
      entry.lastStderr = res.stderr.slice(-2000);
      await saveQueue(this.projectRoot, items);
      return res;
    } catch (err) {
      entry.status = 'failed';
      entry.lastRunAt = new Date().toISOString();
      entry.lastError = err.message;
      await saveQueue(this.projectRoot, items);
      throw err;
    }
  }
}

// Best-effort listing of live notika sessions by probing the local process table.
// Only matches opencode/freebuff; returns [{name, pid, command}].
export function scanRunningAgents() {
  try {
    const out = execFileSync('ps', ['-ax', '-o', 'pid,comm,args'], { encoding: 'utf8' });
    const rows = out.split('\n').slice(1);
    const hits = [];
    for (const row of rows) {
      if (!/opencode|freebuff/.test(row)) continue;
      const [pid, ...rest] = row.trim().split(/\s+/);
      const name = rest.join(' ');
      if (/grep/.test(name)) continue;
      hits.push({ pid: Number(pid), command: name });
    }
    return hits;
  } catch {
    return [];
  }
}

function cwdForPid(pid) {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const match = out.match(/^n(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// Climb from the agent's cwd to the first directory that looks like a project.
function findProjectRoot(startDir) {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(path.join(cur, '.git')) ||
      existsSync(path.join(cur, 'package.json')) ||
      existsSync(path.join(cur, 'pyproject.toml')) ||
      existsSync(path.join(cur, 'Cargo.toml')) ||
      existsSync(path.join(cur, 'go.mod'))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}

// One-line goal inferred from whatever documents why this project exists.
function inferGoal(root) {
  for (const name of ['AGENTS_START_HERE.md', 'AGENTS.md', 'README.md', 'README.MD', 'README']) {
    try {
      const txt = readFileSync(path.join(root, name), 'utf8');
      const line = txt
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#') && l.length > 4);
      if (line) return line.slice(0, 120);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * For each live opencode/freebuff process, infer the project it is sitting in and
 * a one-line goal. Pure process discovery — no state mutation.
 */
export function discoverAgents() {
  const out = [];
  for (const hit of scanRunningAgents()) {
    const cwd = cwdForPid(hit.pid);
    if (!cwd) continue;
    const projectRoot = findProjectRoot(cwd);
    let branch;
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      branch = undefined;
    }
    out.push({ pid: hit.pid, command: hit.command, cwd, projectRoot, branch, goal: inferGoal(projectRoot) });
  }
  return out;
}
