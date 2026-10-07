import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

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
    const argv = ['run', '--print', prompt];
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
    const data = await loadFleet(this.projectRoot);
    const session = data.sessions.find((s) => s.project === project && s.provider === provider);
    if (session) {
      session.lastOutputAt = new Date().toISOString();
      if (exitCode !== 0) session.lastError = `exit ${exitCode}: ${stderr.slice(-300)}`;
      else session.lastError = null;
      await saveFleet(this.projectRoot, data);
    }
    return { exitCode, stdout, stderr, project, provider, cwd: workingDir };
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
