import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ScopeEnforcer } from '../lib/scope-enforcer.mjs';
import { ProductionGate } from '../lib/production-gate.mjs';
import { findSecretLikePaths } from '../lib/secret-paths.mjs';

const READ_COMMANDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'stat',
  'file',
  'du',
  'tree',
  'pwd',
  'echo',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed',
  'tr',
  'diff',
  'basename',
  'dirname',
  'realpath',
  'which',
  'jq',
]);
const GIT_READ_SUBCOMMANDS = new Set([
  'ls-files',
  'log',
  'show',
  'status',
  'diff',
  'branch',
  'rev-parse',
  'shortlog',
  'blame',
  'describe',
]);
const READ_FILTERS = new Set([
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'grep',
  'cut',
  'tr',
  'sed',
  'awk',
  'jq',
  'cat',
  'fgrep',
  'egrep',
]);

// Deny the shell metacharacters that make an allowlist meaningless.
const SHELL_UNSAFE = /[;&<>`$(){}\[\]!*?\\\n\r]/;

// True only if every stage of the pipeline is a permitted read command. This
// still allows `git ls-files | head -50` while rejecting `git ls-files | sh`.
export function isReadOnlyCommand(command) {
  if (typeof command !== 'string' || !command.trim()) return false;
  if (SHELL_UNSAFE.test(command)) return false;
  const stages = command.split('|').map((s) => s.trim());
  return stages.every((stage, index) => {
    const parts = stage.split(/\s+/);
    const program = parts[0];
    if (program === 'git') {
      if (index !== 0) return false;
      // The subcommand is the first argument after `git` that is not a global
      // flag. parts[0] is 'git' itself, which is why this skips index 0.
      const sub = parts.slice(1).find((p) => !p.startsWith('-'));
      return GIT_READ_SUBCOMMANDS.has(sub);
    }
    // Only the first stage may be a plain read command; the rest are filters.
    if (index === 0) return READ_COMMANDS.has(program);
    return READ_FILTERS.has(program);
  });
}

export function makeId() {
  return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

export function createRunConfig(opts = {}) {
  return {
    id: makeId(),
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: opts.goal || 'Untitled run',
    steps: opts.steps || [],
    currentStep: 0,
    result: null,
    error: null,
    output: [],
    provider: opts.provider || null,
    model: opts.model || null,
    trigger: opts.trigger || 'manual',
    metadata: opts.metadata || {},
  };
}

// Builds a user turn for a prompt step that declares no messages of its own.
// Without this, a step like {systemPrompt} only (an empty messages array is
// truthy, so it used to win the `step.messages || messages` fallback) sent the
// model a system prompt and nothing else, and the model free-associated.
function synthesizeUserTurn(run, step) {
  const parts = [];
  if (run?.goal) parts.push(`Goal: ${run.goal}`);
  // Feed back earlier step output so later steps build on earlier ones instead
  // of restarting from nothing.
  const prior = (run?.output || [])
    .filter((r) => r && r.status !== 'failed' && r.output)
    .slice(-4)
    .map((r) => `--- ${r.step} (${r.type}) ---\n${String(r.output).slice(0, 2000)}`);
  if (prior.length) parts.push(`Work completed so far:\n${prior.join('\n\n')}`);
  if (step?.name) parts.push(`Report: "${step.name}"`);
  return parts.join('\n\n') || 'Proceed.';
}

/**
 * Write file content, refusing to persist JavaScript that does not parse.
 *
 * The check runs against a temp sibling with the same extension so that
 * `node --check` applies the right module goal. A step that would leave a file
 * unparseable fails the step and leaves the original file untouched, which is
 * what turns "the run broke my file" into "the run reported a bad step".
 */
async function writeChecked(resolved, content, stepResult, step) {
  if (/\.(mjs|cjs|js)$/.test(resolved)) {
    const tmp = path.join(
      path.dirname(resolved),
      `.nokta-syntax-check-${process.pid}-${Math.random().toString(36).slice(2)}.${path.extname(resolved).slice(1)}`,
    );
    try {
      await fs.writeFile(tmp, content, 'utf8');
      execFileSync('node', ['--check', tmp], { stdio: 'pipe', timeout: 10000 });
    } catch (err) {
      const detail = (err.stderr || err.stdout || err.message || '')
        .toString()
        .split('\n')
        .slice(0, 4)
        .join(' ')
        .trim();
      throw new Error(`Refusing to write ${step.file}: the content does not parse as JavaScript. ${detail}`);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }
  await fs.writeFile(resolved, content, 'utf8');
}

export async function executeStep(run, step, context = {}) {
  const startTime = Date.now();
  const stepResult = {
    step: step.name || step.type,
    type: step.type,
    status: 'running',
    startedAt: new Date().toISOString(),
    output: null,
    error: null,
  };

  try {
    switch (step.type) {
      case 'prompt': {
        const { chatHandler, messages, systemPrompt } = context;
        const stepMessages = step.messages;
        const msgs =
          Array.isArray(stepMessages) && stepMessages.length
            ? stepMessages
            : Array.isArray(messages) && messages.length
              ? messages
              : [{ role: 'user', content: synthesizeUserTurn(run, step) }];
        const sys = step.systemPrompt || systemPrompt || 'You are a senior software engineer. Be concise and correct.';
        const fullMessages = [{ role: 'system', content: sys }, ...msgs];
        const result = await chatHandler.handleChat(fullMessages, {
          stream: false,
          provider: run.provider,
          model: run.model,
        });
        stepResult.output = result.content;
        stepResult.meta = {
          provider: result.provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        };
        break;
      }

      case 'inspect': {
        // Read-only evidence gathering. A `prompt` step has no tools, so an agent
        // asked to describe the codebase could only answer from generic skill
        // text and invent file paths. This lets it actually look.
        //
        // The boundary is an allowlist, not a denylist: only these commands may
        // run, only piped into these read-only filters, and never with a
        // redirect, subshell, or background operator. Runs execute in an isolated
        // worktree, but a read step should not need that to be safe.
        const commands = Array.isArray(step.commands) ? step.commands : [step.command].filter(Boolean);
        if (!commands.length) throw new Error('commands is required for inspect step');
        const projectRoot = path.resolve(context.projectRoot || process.cwd());
        const chunks = [];
        for (const command of commands) {
          if (typeof command !== 'string' || !isReadOnlyCommand(command)) {
            throw new Error(`Command not permitted in inspect step: ${String(command).slice(0, 120)}`);
          }
          const { stdout, stderr } = spawnSync('bash', ['-c', command], {
            cwd: projectRoot,
            encoding: 'utf8',
            timeout: step.timeout || 20000,
            maxBuffer: 4 * 1024 * 1024,
          });
          if (stdout?.trim()) chunks.push(`$ ${command}\n${stdout.trim().slice(0, 20000)}`);
          if (stderr?.trim()) chunks.push(`$ ${command} (stderr)\n${stderr.trim().slice(0, 2000)}`);
          if (stdout === null && stderr === null) {
            chunks.push(`$ ${command}\n(no output)`);
          }
        }
        stepResult.output = chunks.join('\n\n') || '(no output)';
        stepResult.meta = { readOnly: true, commands: commands.length };
        break;
      }

      case 'shell': {
        const cmd = step.command;
        if (!cmd || typeof cmd !== 'string') {
          throw new Error('Command is required for shell step');
        }
        if (
          /rm\s+(-rf|--recursive)\s+(\/|~\/|\*)/i.test(cmd) ||
          />\s*\/dev\/(sd[a-z]|nvme)/i.test(cmd) ||
          /mkfs/i.test(cmd)
        ) {
          throw new Error('Destructive shell command blocked by security guard');
        }
        const projectRoot = path.resolve(context.projectRoot || process.cwd());
        let cwd = step.cwd ? path.resolve(projectRoot, step.cwd) : projectRoot;
        if (!cwd.startsWith(projectRoot)) {
          cwd = projectRoot;
        }
        // A missing cwd makes spawnSync fail with a misleading
        // "spawnSync bash ENOENT" that looks like bash is unavailable. Check it
        // explicitly so a bad plan reports what is actually wrong.
        if (step.cwd) {
          const stat = await fs.stat(cwd).catch(() => null);
          if (!stat?.isDirectory()) {
            const entries = await fs
              .readdir(projectRoot, { withFileTypes: true })
              .then((list) =>
                list
                  .filter((e) => !e.name.startsWith('.'))
                  .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
                  .slice(0, 25),
              )
              .catch(() => []);
            throw new Error(
              `Working directory does not exist: ${step.cwd}. Available in project root: ${entries.join(' ') || '(empty)'}`,
            );
          }
        }
        try {
          const stdout = execFileSync('bash', ['-c', cmd], {
            cwd,
            encoding: 'utf8',
            timeout: step.timeout || 30000,
            maxBuffer: 1024 * 1024,
          });
          stepResult.output = stdout.trim();
          stepResult.exitCode = 0;
        } catch (shellErr) {
          stepResult.output = shellErr.stdout?.trim() || '';
          stepResult.error = shellErr.stderr?.trim() || shellErr.message;
          stepResult.exitCode = shellErr.status || 1;
          if (step.ignoreFailure) {
            stepResult.status = 'completed';
          }
          throw shellErr;
        }
        break;
      }

      case 'scope': {
        // Reuse the run's enforcer so declared scope and mutation history stay
        // on one instance even if a step edited before this point.
        const scopeEnforcer = (context.scopeEnforcer ||= new ScopeEnforcer());
        scopeEnforcer.declareScope(run.id, {
          allowedFiles: step.allowedFiles || [],
          blockedFiles: step.blockedFiles || [],
          allowedDirs: step.allowedDirs || [],
          blockedDirs: step.blockedDirs || ['.git', 'node_modules', '.env'],
          maxFilesChanged: step.maxFilesChanged || 10,
          maxLinesChanged: step.maxLinesChanged || 500,
        });
        stepResult.output = 'Scope declared';
        stepResult.meta = { scope: step };
        break;
      }

      case 'edit': {
        const projectRoot = context.projectRoot || process.cwd();
        const resolved = path.resolve(projectRoot, step.file);
        if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
          throw new Error(`Path traversal detected: ${step.file} resolves outside project root`);
        }

        // Validate the step's own shape before consulting policy, so a
        // malformed step is reported as malformed rather than as a scope
        // violation it never got far enough to commit.
        const newContent = step.content;
        if (typeof newContent !== 'string') {
          throw new Error('content is required for edit step');
        }

        // Always enforce, and always record. This used to be conditional on
        // `context.scopeEnforcer` existing, which it only did if the plan
        // happened to contain a scope step — so a plan without one had no
        // enforcement at all. A scope that names targets further narrows this.
        const scopeEnforcer = (context.scopeEnforcer ||= new ScopeEnforcer());
        const check = scopeEnforcer.validateMutation(run.id, { file: step.file, operation: 'edit' });
        if (!check.allowed) throw new Error(`Scope violation: ${check.reason}`);

        const existing = await fs.readFile(resolved, 'utf8').catch(() => '');
        // Creating a new file implies creating its parent directory; without this
        // a legitimate "add src/foo.js" plan fails with ENOENT.
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        if (step.oldString) {
          if (!existing.includes(step.oldString)) {
            throw new Error(`oldString not found in ${step.file}`);
          }
          const updated = existing.replace(step.oldString, newContent);
          if (updated === existing) {
            throw new Error(`No changes made to ${step.file}`);
          }
          await writeChecked(resolved, updated, stepResult, step);
          stepResult.output = `Replaced in ${step.file}`;
        } else {
          // Without oldString the write replaces the entire file. A planner that
          // emits only the snippet it wants to add — instead of the whole new file
          // body — silently deletes everything else in the file. This happened for
          // real: a 258-line module was replaced by a 5-line stub, 257 lines gone,
          // and the damage was only noticed because a later lint step failed. Scope
          // enforcement bounds which files may be touched, not what happens to their
          // contents, so replacing an existing file has to be an explicit decision.
          if (existing.length > 0 && step.overwrite !== true) {
            const lines = existing.split('\n').length;
            throw new Error(
              `Refusing to replace all of ${step.file} (${lines} existing lines): an edit step must supply 'oldString' to replace part of a file, or an explicit "overwrite": true to replace the whole file`,
            );
          }
          await writeChecked(resolved, newContent, stepResult, step);
          stepResult.output = `Wrote ${step.file}`;
        }
        stepResult.meta = { file: step.file };

        scopeEnforcer.recordMutation(run.id, { file: step.file, operation: 'edit', withinScope: true });
        break;
      }

      case 'review': {
        const { sprintEngine } = context;
        const branch = step.branch || 'HEAD';
        let diff = step.diff;
        if (!diff) {
          try {
            diff = execFileSync('git', ['diff', branch], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
          } catch {
            diff = '';
          }
        }

        // The review needs the sprint engine. Every construction site now
        // provides it, but dereferencing null here crashed the entire run with
        // "Cannot read properties of null" and told the reader nothing. A
        // skipped review is recoverable; a failed run is not.
        if (!sprintEngine) {
          stepResult.status = 'skipped';
          stepResult.output = 'Skipped: no review engine available in this run context';
          stepResult.meta = { skipped: true, reason: 'sprintEngine unavailable' };
          break;
        }

        const result = await sprintEngine.reviewPR(branch, diff, {});
        stepResult.output = result.summary;
        stepResult.meta = { commentsCount: result.comments?.length || 0, errors: result.summary.errors };

        if (diff) {
          const gate = new ProductionGate();
          const gateResult = gate.analyze(diff);
          stepResult.meta.productionGate = {
            score: gateResult.score,
            passed: gateResult.passed,
            summary: gateResult.summary,
          };
          if (!gateResult.passed) {
            stepResult.status = 'completed';
            stepResult.meta.warning = 'Production readiness gate failed';
          }
        }
        break;
      }

      case 'pr': {
        const { owner, repo, title, body, head, base } = step;
        const ghToken = process.env.GITHUB_TOKEN;
        const prTitle = title || `[Nokta] ${run.goal}`;
        const prBody = body || `Automated by Nokta agent run ${run.id}`;
        const prHead = head || `nokta-run-${run.id}`;
        const prBase = base || 'main';

        if (ghToken && owner && repo) {
          const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${ghToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'nokta-agent',
            },
            body: JSON.stringify({ title: prTitle, body: prBody, head: prHead, base: prBase }),
          });
          if (!ghRes.ok) {
            const errBody = await ghRes.text();
            throw new Error(`GitHub API error: ${ghRes.status} ${errBody}`);
          }
          const prData = await ghRes.json();
          stepResult.output = `PR created: ${prData.html_url}`;
          stepResult.meta = { prUrl: prData.html_url, prNumber: prData.number };
        } else {
          // Fall back to local `gh` CLI
          try {
            const cwd = context.projectRoot || process.cwd();
            // Git add, commit and push changes on the head branch before creating PR
            try {
              execFileSync('git', ['checkout', '-b', prHead], { cwd, stdio: 'ignore' });
            } catch {
              try {
                execFileSync('git', ['checkout', prHead], { cwd, stdio: 'ignore' });
              } catch {}
            }
            // `git add .` stages every untracked file, so anything missing from
            // .gitignore would be committed and pushed. Refuse rather than
            // leak, and name the offending paths.
            let staged;
            try {
              staged = execFileSync('git', ['status', '--porcelain'], {
                cwd,
                encoding: 'utf8',
                maxBuffer: 8 * 1024 * 1024,
              });
            } catch (statusErr) {
              throw new Error(`Failed to inspect working tree: ${statusErr.message}`);
            }
            const unsafe = findSecretLikePaths(staged);
            if (unsafe.length > 0) {
              throw new Error(
                `Refusing to commit: untracked secret-like files present (${unsafe.slice(0, 5).join(', ')}). ` +
                  'Add them to .gitignore, or remove them, before creating a PR.',
              );
            }
            try {
              execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
              execFileSync('git', ['commit', '-m', prTitle, '--no-verify'], { cwd, stdio: 'ignore' });
              // --force-with-lease, not --force: a blind force push can destroy
              // commits on the remote that this run never saw.
              execFileSync('git', ['push', '-u', 'origin', prHead, '--force-with-lease'], {
                cwd,
                stdio: 'ignore',
              });
            } catch (gitErr) {
              // Previously swallowed entirely, which made a failed commit or a
              // rejected push indistinguishable from success.
              throw new Error(`Git commit/push failed: ${gitErr.message}`);
            }

            const ghArgs = ['pr', 'create', '--title', prTitle, '--body', prBody, '--head', prHead, '--base', prBase];
            const stdout = execFileSync('gh', ghArgs, { cwd, encoding: 'utf8', timeout: 30000 });
            const prUrl = stdout.trim();
            stepResult.output = `PR created via CLI: ${prUrl}`;
            stepResult.meta = { prUrl, localCli: true };
          } catch (cliErr) {
            throw new Error(`Failed to create PR. GITHUB_TOKEN not configured and 'gh' CLI failed: ${cliErr.message}`);
          }
        }
        break;
      }

      case 'condition': {
        const value = await evaluateCondition(step.condition, context);
        stepResult.output = `Condition "${step.condition}": ${value}`;
        stepResult.meta = { condition: step.condition, result: value };
        if (!value && step.failOnFalse !== false) {
          throw new Error(`Condition not met: ${step.condition}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }

    // A case that already decided its own terminal status — `skipped` for a
    // review with no engine — keeps it. The unconditional assignment here used
    // to overwrite that decision.
    if (stepResult.status === 'running') {
      stepResult.status = 'completed';
    }
  } catch (err) {
    if (stepResult.status !== 'completed') {
      stepResult.status = 'failed';
    }
    if (!stepResult.error) {
      stepResult.error = err.message;
    }
  }

  stepResult.durationMs = Date.now() - startTime;
  return stepResult;
}

async function evaluateCondition(condition, context) {
  if (condition === 'git:hasChanges') {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', timeout: 5000 });
      return status.trim().length > 0;
    } catch {
      return false;
    }
  }
  if (condition === 'git:onBranch') {
    return true;
  }
  if (condition?.startsWith?.('file:exists:')) {
    const fp = condition.slice('file:exists:'.length);
    try {
      await fs.access(path.resolve(context.projectRoot || process.cwd(), fp));
      return true;
    } catch {
      return false;
    }
  }
  if (condition?.startsWith?.('env:')) {
    const envVar = condition.slice('env:'.length);
    return Boolean(process.env[envVar]);
  }
  return true;
}
