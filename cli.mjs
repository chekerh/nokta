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
    import('node:child_process').then(({ execSync }) => {
      try {
        const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
        resolve(branch);
      } catch {
        resolve('main');
      }
    }).catch(reject);
  });
}

function getDiff(branch) {
  return new Promise((resolve, reject) => {
    import('node:child_process').then(({ execSync }) => {
      try {
        const base = branch === 'main' ? 'HEAD~1' : 'main';
        const diff = execSync(`git diff ${base}...HEAD`, { encoding: 'utf8' });
        resolve(diff);
      } catch {
        resolve('');
      }
    }).catch(reject);
  });
}

async function cmdReviewPr(args) {
  const branch = args[0] || await getGitBranch();
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
  const branch = args[0] || await getGitBranch();
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

  console.log(`\nIssues: ${result.summary.issuesFound} (${result.summary.errors} errors, ${result.summary.warnings} warnings)`);
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
`);
}

const commands = {
  compile: cmdCompile,
  gates: cmdGates,
  detect: cmdDetect,
  'review-pr': cmdReviewPr,
  'review-branch': cmdReviewBranch,
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
