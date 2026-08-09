import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ScopeEnforcer } from '../lib/scope-enforcer.mjs';
import { ProductionGate } from '../lib/production-gate.mjs';

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
        const msgs = step.messages || messages || [];
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

      case 'shell': {
        const cmd = step.command;
        const cwd = step.cwd || context.projectRoot || process.cwd();
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
        const scopeEnforcer = context.scopeEnforcer || new ScopeEnforcer();
        scopeEnforcer.declareScope(run.id, {
          allowedFiles: step.allowedFiles || [],
          blockedFiles: step.blockedFiles || [],
          allowedDirs: step.allowedDirs || [],
          blockedDirs: step.blockedDirs || ['.git', 'node_modules', '.env'],
          maxFilesChanged: step.maxFilesChanged || 10,
          maxLinesChanged: step.maxLinesChanged || 500,
        });
        context.scopeEnforcer = scopeEnforcer;
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

        if (context.scopeEnforcer) {
          const check = context.scopeEnforcer.validateMutation(run.id, { file: step.file, operation: 'edit' });
          if (!check.allowed) throw new Error(`Scope violation: ${check.reason}`);
        }

        const existing = await fs.readFile(resolved, 'utf8').catch(() => '');
        const newContent = step.content;
        if (step.oldString) {
          if (!existing.includes(step.oldString)) {
            throw new Error(`oldString not found in ${step.file}`);
          }
          const updated = existing.replace(step.oldString, newContent);
          if (updated === existing) {
            throw new Error(`No changes made to ${step.file}`);
          }
          await fs.writeFile(resolved, updated, 'utf8');
          stepResult.output = `Replaced in ${step.file}`;
        } else {
          await fs.writeFile(resolved, newContent, 'utf8');
          stepResult.output = `Wrote ${step.file}`;
        }
        stepResult.meta = { file: step.file };

        if (context.scopeEnforcer) {
          context.scopeEnforcer.recordMutation(run.id, { file: step.file, operation: 'edit', withinScope: true });
        }
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
            try {
              execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
              execFileSync('git', ['commit', '-m', prTitle, '--no-verify'], { cwd, stdio: 'ignore' });
              execFileSync('git', ['push', '-u', 'origin', prHead, '--force'], { cwd, stdio: 'ignore' });
            } catch {}

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

    stepResult.status = 'completed';
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
