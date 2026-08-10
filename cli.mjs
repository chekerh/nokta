#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SprintEngine } from './daemon/lib/sprint-engine.mjs';
import { logger } from './daemon/lib/logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function _runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: opts.cwd || process.cwd(),
      shell: process.platform === 'win32',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function getGitBranch() {
  return new Promise((resolve, reject) => {
    import('node:child_process')
      .then(({ execSync }) => {
        try {
          const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
          resolve(branch);
        } catch {
          resolve('main');
        }
      })
      .catch(reject);
  });
}

function getDiff(branch) {
  return new Promise((resolve, reject) => {
    import('node:child_process')
      .then(({ execSync }) => {
        try {
          const base = branch === 'main' ? 'HEAD~1' : 'main';
          const diff = execSync(`git diff ${base}...HEAD`, { encoding: 'utf8' });
          resolve(diff);
        } catch {
          resolve('');
        }
      })
      .catch(reject);
  });
}

async function cmdReviewPr(args) {
  const branch = args[0] || (await getGitBranch());
  const projectRoot = process.cwd();
  const log = logger.child ? logger.child({ module: 'cli' }) : logger;

  log.info(`Reviewing branch: ${branch}`);
  const diff = await getDiff(branch);

  if (!diff) {
    console.log('No diff found. Make sure you have commits to review.');
    return;
  }

  const engine = new SprintEngine(projectRoot, { log });
  const result = await engine.reviewPR(branch, diff);

  console.log(`\n=== PR Review: ${branch} ===\n`);
  console.log(`Branch: ${result.summary.branch}`);
  console.log(`Total additions: ${result.summary.totalAdditions}`);
  console.log(`Issues found: ${result.summary.issuesFound}`);
  console.log(`  Errors: ${result.summary.errors}`);
  console.log(`  Warnings: ${result.summary.warnings}`);
  console.log(`Overall: ${result.summary.overall}`);
  console.log(`Linked tasks: ${result.summary.linkedTasks.join(', ') || 'none'}`);
  console.log(`Auto-close tasks: ${result.summary.autoCloseTasks.join(', ') || 'none'}`);

  if (result.comments.length > 0) {
    console.log('\n--- Issues ---\n');
    for (const c of result.comments) {
      console.log(`[${c.severity.toUpperCase()}] ${c.file}:${c.line || '?'}`);
      console.log(`  Rule: ${c.rule}`);
      console.log(`  Message: ${c.message}`);
      if (c.suggestion) console.log(`  Suggestion: ${c.suggestion}`);
      console.log('');
    }
  }

  if (result.summary.overall === 'changes-requested') {
    console.log('\n⚠️  Changes requested before merging.\n');
    process.exit(1);
  } else if (result.summary.overall === 'approved') {
    console.log('\n✅ PR looks good to merge.\n');
  } else {
    console.log('\n💬 Comments added — review before merging.\n');
  }
}

async function cmdReviewBranch(args) {
  const branch = args[0] || (await getGitBranch());
  const projectRoot = process.cwd();
  const log = logger.child ? logger.child({ module: 'cli' }) : logger;

  log.info(`Reviewing branch: ${branch}`);
  const diff = await getDiff(branch);

  if (!diff) {
    console.log('No diff found. Make sure you have commits to review.');
    return;
  }

  const files = diff
    .split('\n')
    .filter((l) => l.startsWith('+++ b/'))
    .map((l) => l.slice(6));

  console.log(`\nBranch: ${branch}`);
  console.log(`Changed files: ${files.length}`);
  console.log('Files:');
  for (const f of files) {
    console.log(`  - ${f}`);
  }

  const engine = new SprintEngine(projectRoot, { log });
  const result = await engine.reviewPR(branch, diff);

  console.log(
    `\nIssues: ${result.summary.issuesFound} (${result.summary.errors} errors, ${result.summary.warnings} warnings)`,
  );
  console.log(`Overall: ${result.summary.overall}`);
}

async function cmdCompile(args) {
  const target = args[0] || process.cwd();
  console.log(`Compiling context for: ${target}`);
  const { compileContext } = await import('./compiler/lib/compile.mjs');
  try {
    const result = compileContext({ target, adapter: 'codex', task: 'general software engineering task' });
    if (args.includes('--out')) {
      const outIdx = args.indexOf('--out');
      const outPath = args[outIdx + 1];
      if (outPath) {
        const fs = await import('node:fs');
        fs.writeFileSync(outPath, result.markdown);
        console.log(`Wrote compiled context to ${outPath}`);
      }
    } else {
      console.log(result.markdown);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

async function cmdGates(args) {
  const target = args[0] || process.cwd();
  console.log(`Evaluating trail gates for: ${target}`);
  const { evaluateTrailGates } = await import('./compiler/lib/gates.mjs');
  const results = evaluateTrailGates(target);
  for (const r of results) {
    const status = r.status.toUpperCase();
    const remediation = r.remediation ? ` → ${r.remediation}` : '';
    console.log(`[${status}] ${r.gate}: ${r.message}${remediation}`);
  }
  const failures = results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    console.log(`\n${failures.length} gate(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll gates passed.');
  }
}

async function cmdDetect(args) {
  const target = args[0] || process.cwd();
  console.log(`Detecting project stack at: ${target}`);
  const { detectProject } = await import('./compiler/lib/detect.mjs');
  const result = detectProject(target);
  console.log(`\nStacks: ${result.stacks.join(', ') || 'none detected'}`);
  console.log(`Package managers: ${result.packageManagers.join(', ') || 'none detected'}`);
  console.log(`Files analyzed: ${result.files.length}`);
}

async function cmdDaemon(args) {
  const sub = args[0];
  const projectRoot = process.cwd();
  const port = process.env.NOKTA_PORT || '4217';

  if (sub === 'stop') {
    const pidFile = path.join(projectRoot, '.nokta', 'daemon.pid');
    try {
      const fs = await import('node:fs');
      const pid = parseInt(fs.default.readFileSync(pidFile, 'utf8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      console.log(`Daemon (PID ${pid}) stopped.`);
    } catch (err) {
      console.error(`Could not stop daemon: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === 'status') {
    try {
      const resp = await fetch(`http://localhost:${port}/health`);
      const health = await resp.json();
      console.log(`Daemon: ${health.status}`);
      console.log(`Version: ${health.version}`);
      console.log(`Providers: ${health.providers?.length || 0}`);
      for (const p of health.providers || []) {
        const icon = p.healthy ? '✅' : p.enabled ? '⚠️' : '⚫';
        console.log(`  ${icon} ${p.name}`);
      }
    } catch {
      console.log('Daemon: not running');
      process.exit(1);
    }
    return;
  }

  if (sub === 'start' || !sub) {
    console.log(`Starting Nokta daemon on port ${port}...`);
    const proc = spawn('node', [path.join(__dirname, 'daemon', 'index.mjs'), 'daemon'], {
      stdio: 'inherit',
      cwd: projectRoot,
      env: { ...process.env, NOKTA_PORT: port },
    });
    const fs = await import('node:fs');
    fs.default.writeFileSync(path.join(projectRoot, '.nokta', 'daemon.pid'), String(proc.pid));
    proc.on('exit', () => {
      try {
        fs.default.unlinkSync(path.join(projectRoot, '.nokta', 'daemon.pid'));
      } catch {}
    });
    return;
  }

  console.error(`Unknown daemon subcommand: ${sub}`);
  console.log('Usage: nokta daemon [start|stop|status]');
  process.exit(1);
}

async function cmdTrail(args) {
  const sub = args[0];
  const target = args[1] || process.cwd();

  if (sub === 'init') {
    const { initProject } = await import('./compiler/nokta-init.mjs');
    initProject(target);
    console.log('Trail initialized.');
    return;
  }

  if (sub === 'status') {
    const trailPath = path.join(target, '.ai', 'trail');
    const fs = await import('node:fs');
    if (!fs.default.existsSync(trailPath)) {
      console.log('No trail found.');
      return;
    }
    const files = fs.default.readdirSync(trailPath);
    console.log(`Trail: ${files.length} files`);
    for (const f of files) {
      console.log(`  - ${f}`);
    }
    return;
  }

  if (sub === 'validate') {
    const { evaluateTrailGates } = await import('./compiler/lib/gates.mjs');
    const results = evaluateTrailGates(target);
    const failures = results.filter((r) => r.status === 'fail');
    for (const r of results) {
      const status = r.status.toUpperCase();
      console.log(`[${status}] ${r.gate}: ${r.message}`);
    }
    if (failures.length > 0) {
      console.log(`\n${failures.length} gate(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll gates passed.');
    return;
  }

  console.error(`Unknown trail subcommand: ${sub}`);
  console.log('Usage: nokta trail [init|status|validate] [target]');
  process.exit(1);
}

async function cmdDecisions(args) {
  const sub = args[0];
  const projectRoot = process.cwd();
  const { DecisionEngine } = await import('./daemon/lib/decision-engine.mjs');
  const engine = new DecisionEngine(projectRoot);

  if (sub === 'list' || sub === 'ls') {
    const filters = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--type' && args[i + 1]) filters.type = args[i + 1];
      if (args[i] === '--status' && args[i + 1]) filters.status = args[i + 1];
    }
    const decisions = await engine.listDecisions(filters);
    if (decisions.length === 0) {
      console.log('No decisions recorded.');
      return;
    }
    for (const d of decisions) {
      const icon = d.status === 'accepted' ? '✅' : d.status === 'proposed' ? '💡' : '❌';
      console.log(`${icon} ${d.id}: ${d.title} [${d.type}] ${d.status}`);
    }
    return;
  }

  if (sub === 'show') {
    const id = args[1];
    if (!id) {
      console.error('Usage: nokta decisions show <id>');
      process.exit(1);
    }
    try {
      const decision = await engine.getDecision(id);
      console.log(`Decision: ${decision.title}`);
      console.log(`ID: ${decision.id}`);
      console.log(`Status: ${decision.status}`);
      console.log(`Type: ${decision.type}`);
      console.log(`Created: ${decision.createdAt}`);
      if (decision.context) console.log(`Context: ${decision.context}`);
      if (decision.decision) console.log(`Decision: ${decision.decision}`);
      if (decision.consequences) console.log(`Consequences: ${decision.consequences}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  if (sub === 'create') {
    const title = args[1];
    const type = args[2] || 'architectural';
    if (!title) {
      console.error('Usage: nokta decisions create <title> [type]');
      process.exit(1);
    }
    const decision = await engine.createDecision({
      title,
      type,
      status: 'proposed',
      context: 'Created via CLI',
      decision: '',
      consequences: '',
    });
    console.log(`Created decision: ${decision.id}`);
    console.log(`View with: nokta decisions show ${decision.id}`);
    return;
  }

  console.error(`Unknown decisions subcommand: ${sub}`);
  console.log('Usage: nokta decisions [list|show|create]');
  process.exit(1);
}

async function cmdKanban() {
  const port = process.env.NOKTA_PORT || '4217';
  const { execSync } = await import('node:child_process');
  const url = `http://localhost:${port}/`;
  console.log(`Opening Nokta Kanban board in browser: ${url}`);
  execSync(`open "${url}"`, { stdio: 'ignore' });
}

async function cmdChat(args) {
  const projectRoot = process.cwd();
  const { ProviderManager } = await import('./daemon/lib/provider-manager.mjs');
  const { ChatHandler } = await import('./daemon/lib/chat-handler.mjs');
  const log = logger.child ? logger.child({ module: 'cli' }) : logger;

  const providerManager = new ProviderManager({ log });
  await providerManager.initDefaults();
  const chatHandler = new ChatHandler(providerManager, { projectRoot, log });
  const query = args.join(' ') || 'Hello, who are you?';

  console.log(`\n💬 Nokta Chat: ${query}\n`);
  const result = await chatHandler.handleChat([{ role: 'user', content: query }], {
    stream: false,
    temperature: 0.7,
  });
  console.log(result.content + '\n');
}

async function cmdAgent(args) {
  const sub = args[0];
  const projectRoot = process.cwd();
  const { SprintEngine } = await import('./daemon/lib/sprint-engine.mjs');
  const { ProviderManager } = await import('./daemon/lib/provider-manager.mjs');
  const { AgentOrchestrator } = await import('./daemon/agent/orchestrator.mjs');
  const log = logger.child ? logger.child({ module: 'cli' }) : logger;

  if (sub === 'list' || sub === 'ls') {
    const engine = new SprintEngine(projectRoot, { log });
    const data = await engine._load();
    const items = Object.values(data.items);
    const pending = items.filter((i) => i.status === 'backlog' || i.status === 'ready');
    const inProgress = items.filter((i) => i.status === 'in-progress' || i.status === 'review');
    const done = items.filter((i) => i.status === 'done');
    console.log(`Total items: ${items.length}`);
    console.log(`  Backlog/Ready: ${pending.length}`);
    console.log(`  In Progress/Review: ${inProgress.length}`);
    console.log(`  Done: ${done.length}`);
    if (pending.length > 0) {
      console.log('\nPending items:');
      for (const item of pending.slice(0, 10)) {
        console.log(`  📋 [${item.priority}] ${item.title} (${item.id})`);
      }
    }
    return;
  }

  if (sub === 'run') {
    const task = args[1];
    if (!task) {
      console.error('Usage: nokta agent run <task description>');
      process.exit(1);
    }
    console.log(`Running agent task: ${task}`);
    const providerManager = new ProviderManager({ log });
    await providerManager.initDefaults();
    const { JobQueue } = await import('./daemon/agent/job-queue.mjs');
    const { JobWorker } = await import('./daemon/agent/job-worker.mjs');
    const jobQueue = new JobQueue(log);
    await jobQueue.init();
    const worker = new JobWorker({ projectRoot, log, providerManager, jobQueue });
    await worker.start();
    const orchestrator = new AgentOrchestrator(projectRoot, { log, providerManager, jobQueue });
    const run = await orchestrator.runTask(task);
    console.log(`\nRun complete: ${run.status}`);
    if (run.result) console.log(run.result);
    await worker.stop();
    await jobQueue.close();
    return;
  }

  console.error(`Unknown agent subcommand: ${sub}`);
  console.log('Usage: nokta agent [list|run]');
  process.exit(1);
}

async function cmdIndex() {
  const projectRoot = process.cwd();
  const { SprintEngine } = await import('./daemon/lib/sprint-engine.mjs');
  const log = logger.child ? logger.child({ module: 'cli' }) : logger;
  const engine = new SprintEngine(projectRoot, { log });
  const summary = await engine.getSummary();

  console.log(`\n📊 Nokta Project Index: ${projectRoot}\n`);
  console.log(`📋 Items: ${summary.totalItems}`);
  console.log(`   Backlog: ${summary.byStatus.backlog}`);
  console.log(`   Ready: ${summary.byStatus.ready}`);
  console.log(`   In Progress: ${summary.byStatus['in-progress']}`);
  console.log(`   Review: ${summary.byStatus.review}`);
  console.log(`   Done: ${summary.byStatus.done}`);
  console.log('\n🏷  Priority:');
  console.log(`   P0: ${summary.byPriority.P0}`);
  console.log(`   P1: ${summary.byPriority.P1}`);
  console.log(`   P2: ${summary.byPriority.P2}`);
  console.log(`   P3: ${summary.byPriority.P3}`);
  console.log(`   P4: ${summary.byPriority.P4}`);
  console.log(`\n🏗️  Epics: ${summary.epics}`);
  console.log(`💡 Initiatives: ${summary.initiatives}`);
  console.log(`🏃 Sprints: ${summary.sprints}`);
  if (summary.activeSprint) {
    console.log(`📍 Active Sprint: ${summary.activeSprint.name || summary.activeSprint.id}`);
  }
  console.log('\n✨ Nokta: Evidence-first, token-efficient AI operating system.');
}

function showHelp() {
  console.log(`
nokta — AI Operating System

Usage:
  nokta <command> [options]

Commands:
  compile <target> [--out <file>]  Compile context for a project
  gates <target>                   Evaluate trail gates
  detect <target>                  Detect project stack
  review-pr [branch]               Review PR on a branch
  review-branch [branch]           Review a branch
  daemon [start|stop|status]       Manage the Nokta daemon
  trail [init|status|validate]     Manage the trail protocol
  decisions [list|show|create]     Manage architectural decisions
  kanban                           Open the Kanban board in browser
  chat [query]                     Chat with Nokta via LLM
  agent [list|run]                 List items or run an agent task
  index                            Show project index/dashboard

Options:
  --help                           Show this help message
  --version                        Show version

Examples:
  nokta compile .                  Compile context for current project
  nokta compile . --out .ai/compiled-context.md
  nokta gates .                    Check trail gate compliance
  nokta detect .                   Detect tech stack
  nokta review-pr feature/auth     Review PR on feature/auth branch
  nokta review-branch              Review current branch
  nokta daemon start               Start the daemon
  nokta daemon status              Check daemon health
  nokta trail status               Show trail files
  nokta decisions list             List architectural decisions
  nokta kanban                     Open Kanban board
  nokta chat "How do I handle auth in Express?"  Ask Nokta
  nokta agent list                 List pending sprint items
  nokta agent run "Implement auth"  Run an agent task
  nokta index                      Show project dashboard
`);
}

const commands = {
  compile: cmdCompile,
  gates: cmdGates,
  detect: cmdDetect,
  'review-pr': cmdReviewPr,
  'review-branch': cmdReviewBranch,
  daemon: cmdDaemon,
  trail: cmdTrail,
  decisions: cmdDecisions,
  kanban: cmdKanban,
  chat: cmdChat,
  agent: cmdAgent,
  index: cmdIndex,
};

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    showHelp();
    return;
  }

  if (cmd === '--version' || cmd === '-v') {
    const fs = await import('node:fs');
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.default.readFileSync(pkgPath, 'utf8'));
    console.log(pkg.version);
    return;
  }

  const handler = commands[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    console.log('');
    showHelp();
    process.exit(1);
  }

  try {
    await handler(args.slice(1));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
