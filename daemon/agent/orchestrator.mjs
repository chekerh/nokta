import EventEmitter from 'node:events';
import { createRunConfig, executeStep } from './executor.mjs';
import * as fileStorage from './storage.mjs';
import * as dbStorage from './db-storage.mjs';
import { buildProjectContext, renderProjectContext } from './project-context.mjs';
import { buildPackSteps, auditCitations } from './agent-pack.mjs';
import { execFileSync } from 'node:child_process';
import { findSecretLikePaths } from '../lib/secret-paths.mjs';
import { createRunWorktree } from './worktree.mjs';
import { LocalSkills } from '../workspace/skills.mjs';
import { NOOP_LOG } from '../lib/route-utils.mjs';

export const STEP_TYPES = ['prompt', 'shell', 'scope', 'edit', 'review', 'pr', 'condition', 'inspect'];

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

// Model output is untrusted: it may omit "type", invent unknown types, or return
// a non-array. Normalize to only executable steps so a malformed plan degrades
// gracefully instead of corrupting the run row.
export function normalizeSteps(steps, fallback) {
  if (!Array.isArray(steps)) return fallback;
  const valid = steps.filter((s) => s && typeof s === 'object' && STEP_TYPES.includes(s.type));
  return valid.length ? valid : fallback;
}

export class AgentOrchestrator extends EventEmitter {
  constructor(projectRoot, options = {}) {
    super();
    this.projectRoot = projectRoot;
    this.runs = [];
    this.log = options.log || NOOP_LOG;
    this.providerManager = options.providerManager || null;
    this.chatHandler = options.chatHandler || null;
    this.sprintEngine = options.sprintEngine || null;
    this.skills = options.skills || new LocalSkills();
    this.requireIsolation = options.requireIsolation || process.env.NOKTA_REQUIRE_ISOLATION === 'true';
    this._isolation = options.isolation;
    this._loaded = false;
    this._activeExecutions = new Map();
  }

  async load() {
    if (this._loaded) return;
    this.runs = await fileStorage.getAllRuns(this.projectRoot);
    this._loaded = true;
  }

  async _persist() {
    await fileStorage.saveRuns(this.projectRoot, this.runs);
  }

  async createRun(opts = {}) {
    const useDb = !!opts.userId;
    if (!useDb) {
      await this.load();
      const run = createRunConfig(opts);
      this.runs.unshift(run);
      await this._persist();
      this.emit('run:created', run);
      return run;
    }

    const run = createRunConfig(opts);
    run.user_id = opts.userId;
    dbStorage.insertRun(run);
    this.emit('run:created', run);
    return run;
  }

  getRun(runId, userId = null) {
    if (userId) {
      return dbStorage.getRunById(userId, runId);
    }
    return this.runs.find((r) => r.id === runId) || dbStorage.getRunByIdAny(runId);
  }

  listRuns(opts = {}) {
    if (opts.userId) {
      return dbStorage.getAllRuns(opts.userId, { status: opts.status, trigger: opts.trigger, limit: opts.limit });
    }
    let items = [...this.runs];
    if (opts.status) items = items.filter((r) => r.status === opts.status);
    if (opts.trigger) items = items.filter((r) => r.trigger === opts.trigger);
    if (opts.limit) items = items.slice(0, opts.limit);
    return items;
  }

  // Records a terminal failure for a run that could not execute (queue/worker
  // crash, timeout). Without this the run stays 'created'/'running' and keeps
  // consuming a concurrency slot until the stale-run reaper fires.
  //
  // Never throws: it runs from .catch() handlers, and a failure here must not
  // become an unhandled rejection. Runs that already reached a terminal state
  // keep their more specific error (e.g. the failing step's message).
  async failRun(runId, userId, error) {
    const message = typeof error === 'string' ? error : error?.message || 'Run failed';
    try {
      if (userId) {
        const existing = dbStorage.getRunById(userId, runId);
        if (existing && TERMINAL_STATUSES.has(existing.status)) return;
        dbStorage.updateRunStatus(runId, { status: 'failed', error: message });
      } else {
        const run = this.getRun(runId);
        if (!run || TERMINAL_STATUSES.has(run.status)) return;
        run.status = 'failed';
        run.error = message;
        run.updatedAt = new Date().toISOString();
        await this._persist();
      }
    } catch (err) {
      this.log.error(`failRun(${runId}) could not record failure: ${err.message}`);
    }
  }

  async cancelRun(runId, userId = null) {
    const existing = this._activeExecutions.get(runId);
    if (existing) {
      existing.aborted = true;
    }

    if (userId) {
      dbStorage.updateRunStatus(runId, { status: 'cancelled' });
      const run = dbStorage.getRunById(userId, runId);
      this.emit('run:updated', run);
      return run;
    }

    const run = this.getRun(runId);
    if (run && (run.status === 'running' || run.status === 'created')) {
      run.status = 'cancelled';
      run.updatedAt = new Date().toISOString();
      await this._persist();
      this.emit('run:updated', run);
    }
    return run;
  }

  // Runs are isolated by default. Set NOKTA_RUN_ISOLATION=false to opt out
  // process-wide, or pass { isolation: false } for a single orchestrator
  // (tests use this so they do not litter the real repository with worktrees).
  isolationEnabled() {
    if (this._isolation !== undefined) return this._isolation;
    return process.env.NOKTA_RUN_ISOLATION !== 'false';
  }

  _recordWorktree(run, wt) {
    const info = { path: wt.path, branch: wt.branch, baseRef: 'HEAD' };
    run.metadata = { ...(run.metadata || {}), worktree: info };
    if (run.user_id) {
      dbStorage.updateRunStatus(run.id, { metadata: run.metadata });
    }
    this.emit('run:isolated', { runId: run.id, ...info });
    return info;
  }

  _finalizeWorktree(run, wtInfo) {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: wtInfo.path, encoding: 'utf8' }).trim();
      if (!status) {
        this.log.info('Worktree had no changes; nothing to merge.');
        return;
      }
      const secrets = findSecretLikePaths(status);
      if (secrets.length) {
        this.log.warn(`Refusing to commit: secret-like files detected (${secrets.join(', ')}).`);
        return;
      }
      const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: wtInfo.path, encoding: 'utf8' });
      this.log.info(`Worktree changes (merge with: git merge ${wtInfo.branch}):\n${diff}`);
      if (process.env.NOKTA_AUTO_MERGE === 'true') {
        execFileSync('git', ['add', '-A'], { cwd: wtInfo.path, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', `nokta run ${run.id}`], { cwd: wtInfo.path, stdio: 'ignore' });
        try {
          execFileSync('git', ['merge', '--no-ff', wtInfo.branch, '-m', `Merge nokta run ${run.id}`], { cwd: this.projectRoot, stdio: 'pipe' });
          this.log.info(`Merged worktree branch ${wtInfo.branch} into current branch`);
        } catch {
          try { execFileSync('git', ['merge', '--abort'], { cwd: this.projectRoot, stdio: 'ignore' }); } catch {}
          this.log.warn('Could not auto-merge worktree; resolve manually.');
        }
      }
    } catch (err) {
      this.log.warn(`Worktree finalize failed: ${err.message}`);
    }
  }

  async executeRun(runId, userId = null) {
    await this.load();
    const run = this.getRun(runId, userId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    if (run.status !== 'created' && run.status !== 'failed' && run.status !== 'cancelled') {
      throw new Error(`Run ${runId} is already ${run.status}`);
    }

    run.status = 'running';
    run.currentStep = 0;
    run.output = [];
    run.error = null;
    run.updatedAt = new Date().toISOString();

    if (run.user_id) {
      dbStorage.updateRunStatus(runId, { status: 'running', currentStep: 0 });
    } else {
      await this._persist();
    }
    this.emit('run:started', run);

    const executionCtx = { aborted: false, runId };
    this._activeExecutions.set(runId, executionCtx);

    // Isolate the run in its own git worktree so it can never overwrite the
    // tree that is executing it. Executable steps resolve paths against
    // `projectRoot`, so pointing that at the worktree contains every write.
    let workingRoot = this.projectRoot;
    if (this.isolationEnabled(run)) {
      const wt = createRunWorktree({ projectRoot: this.projectRoot, runId, baseRef: run.baseRef || 'HEAD' });
      if (wt.ok) {
        workingRoot = wt.path;
        this._recordWorktree(run, wt);
        this.log.info(`Run ${runId} isolated in worktree ${wt.branch} at ${wt.path}`);
      } else {
        this.log.warn(`Run ${runId} not isolated: ${wt.reason}`);
        if (this.requireIsolation) {
          this._activeExecutions.delete(runId);
          dbStorage.updateRunStatus(runId, { status: 'failed', error: `Isolation required: ${wt.reason}` });
          throw new Error(`Isolation required but unavailable: ${wt.reason}`);
        }
      }
    }

    const context = {
      chatHandler: this.chatHandler,
      sprintEngine: this.sprintEngine,
      projectRoot: workingRoot,
      providerManager: this.providerManager,
    };

    // Healthy providers available for mid-run failover.
    let healthyProviders = [];
    if (this.providerManager?.health) {
      try {
        const h = await this.providerManager.health();
        healthyProviders = Object.keys(h || {}).filter((id) => h[id]?.status === 'ok');
      } catch {}
    }
    if (!healthyProviders.length && run.provider) healthyProviders = [run.provider];
    let providerIndex = Math.max(0, healthyProviders.indexOf(run.provider));

    for (let i = 0; i < run.steps.length; i++) {
      if (executionCtx.aborted) {
        run.status = 'cancelled';
        break;
      }

      run.currentStep = i;
      const step = run.steps[i];
      this.emit('run:step-start', { runId, stepIndex: i, step });

      let stepResult;
      let failoverAttempts = 0;
      while (true) {
        try {
          stepResult = await executeStep(run, step, context);
        } catch (err) {
          stepResult = {
            step: step.name || step.type,
            type: step.type,
            status: 'failed',
            error: err.message,
            durationMs: 0,
          };
        }
        if (
          stepResult.status !== 'failed' ||
          step.ignoreFailure ||
          failoverAttempts + 1 >= healthyProviders.length
        ) {
          break;
        }
        failoverAttempts++;
        providerIndex = Math.min(providerIndex + 1, healthyProviders.length - 1);
        run.provider = healthyProviders[providerIndex];
        this.log.warn(`Step failed on ${healthyProviders[providerIndex - 1]}; failing over to ${run.provider}`);
      }

      run.output.push(stepResult);
      this.emit('run:step-complete', { runId, stepIndex: i, stepResult });

      if (run.user_id) {
        dbStorage.updateRunStatus(runId, {
          currentStep: i + 1,
          status: stepResult.status === 'failed' ? 'failed' : undefined,
          error: stepResult.error || null,
        });
        dbStorage.insertStepResult(runId, i, stepResult);
      }

      if (stepResult.status === 'failed' && !step.ignoreFailure) {
        run.status = 'failed';
        run.error = stepResult.error;
        break;
      }
    }

    if (run.status === 'running') {
      run.status = 'completed';
    }

    // Surface isolated-run edits in the main tree instead of stranding them in
    // the worktree. Commit the worktree's changes, then merge the branch back;
    // on conflict, abort and print the diff for manual resolution.
    const wtInfo = run.metadata?.worktree;
    if (wtInfo?.path && wtInfo?.branch && run.status === 'completed') {
      this._finalizeWorktree(run, wtInfo);
    }

    // An agent pack's output is its deliverable, and the run row is the only
    // durable place to keep it. Gated on agentId so ordinary runs are unaffected.
    if (run.metadata?.agentId && run.status === 'completed') {
      const deliverable = [...(run.output || [])].reverse().find((o) => o?.status === 'completed' && o?.output);
      if (deliverable) await this.attachDeliverable(runId, userId, deliverable.output);
    }

    run.updatedAt = new Date().toISOString();
    this._activeExecutions.delete(runId);

    if (run.user_id) {
      dbStorage.updateRunStatus(runId, { status: run.status, error: run.error || null });
    } else {
      await this._persist();
    }
    this.emit('run:completed', run);

    return run;
  }

  async deleteRun(runId, userId = null) {
    if (userId) {
      dbStorage.deleteRunById(userId, runId);
      this.emit('run:deleted', runId);
      return;
    }
    await this.load();
    const idx = this.runs.findIndex((r) => r.id === runId);
    if (idx === -1) throw new Error(`Run not found: ${runId}`);
    this.runs.splice(idx, 1);
    await this._persist();
    this.emit('run:deleted', runId);
  }

    async generateSteps(goal, _context = {}) {
    if (!this.chatHandler) {
      return this._generateDefaultSteps(goal);
    }

    const [projectContext, skills] = await Promise.all([
      buildProjectContext(this.projectRoot, { maxFiles: 50, maxDepth: 2 }),
      this.skills.select(goal).catch(() => []),
    ]);

    const skillBlock = skills.length
      ? [
          'Relevant skills available in this project (follow their guidance when applicable):',
          ...skills.map((s) => `- ${s.name}: ${(s.description || '').slice(0, 200)}`),
        ].join('\n')
      : 'No matching skills found in the skill index.';

    const prompt = `You are a software engineering agent planner. Given a goal and project context, generate a sequence of steps to accomplish the goal.

Available step types:
- prompt: Call an AI model with messages. Fields: messages (array of {role, content}), systemPrompt (optional).
- shell: Run a shell command. Fields: command (string), cwd (optional), timeout (ms, default 30000), ignoreFailure (optional).
- edit: Edit a file. Fields: file (path relative to project root), content, oldString (optional), overwrite (optional).
- review: Review current changes. Fields: branch (optional, default HEAD), diff (optional).
- condition: Check a condition. Fields: condition (string like "git:hasChanges"), failOnFalse (optional).
- scope: Declare which files this run is permitted to modify. REQUIRED before any edit step.
  Fields: allowedFiles (array of glob patterns), allowedDirs (array of directories), blockedFiles (optional), maxFilesChanged (optional), maxLinesChanged (optional).

Respond with ONLY a JSON array of steps. No explanation. Each step MUST have a "type" field set to one of: ${STEP_TYPES.join(', ')}, plus the relevant fields for that type.

Goal: ${goal}

Repository context (ground truth - use only these paths and extensions):
${renderProjectContext(projectContext)}

${skillBlock}

Produce the fewest steps that genuinely accomplish the goal. Prefer editing existing files. Do not invent directories or file types that are not present above.

When the goal requires code changes, the plan MUST include, in order: a scope step naming the files/dirs to touch (before any edit), the edit steps, a shell step that runs the project's tests, and a final review step. A plan that edits without scope, or that never runs tests, is incomplete.`;

    try {
      const result = await this.chatHandler.handleChat([{ role: 'user', content: prompt }], {
        stream: false,
        temperature: 0.3,
      });
      const content = (result.content || '').trim();
      if (!content) throw new Error('empty model output');
      const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
      const steps = JSON.parse(cleaned);
      const normalized = normalizeSteps(steps, null);
      if (normalized && normalized.length) return normalized;
    } catch (err) {
      this.log.warn(`generateSteps failed: ${err.message}`);
    }

    return this._generateDefaultSteps(goal);
  }

  _generateDefaultSteps(goal) {
    return [
      {
        type: 'prompt',
        name: 'Analyze goal',
        messages: [
          {
            role: 'user',
            content: `Analyze the following goal and describe what needs to be done, listing specific files and changes:\n\n${goal}`,
          },
        ],
        systemPrompt:
          'You are a software architect. Analyze the goal and list specific files that need to be created or modified. Be specific.',
      },
      { type: 'shell', name: 'Check git status', command: 'git status --short', ignoreFailure: true },
      {
        type: 'condition',
        name: 'Check for uncommitted changes',
        condition: 'git:hasChanges',
        failOnFalse: false,
      },
      {
        type: 'prompt',
        name: 'Generate implementation plan',
        messages: [],
        systemPrompt:
          'You are a senior engineer. Based on the previous analysis, create a concrete implementation plan.',
      },
      {
        type: 'shell',
        name: 'Run tests',
        command: 'npm test 2>/dev/null || echo "No test command found"',
        ignoreFailure: true,
      },
      {
        type: 'review',
        name: 'Review implementation plan',
        branch: 'HEAD',
      },
    ];
  }

  autoPrioritize(steps) {
    const prioritized = [...steps];
    for (let i = 0; i < prioritized.length; i++) {
      const step = prioritized[i];
      if (step.type === 'shell' && step.name?.includes('Run tests')) {
        step.priority = 'high';
      }
      if (step.type === 'condition' && step.name?.includes('Check for uncommitted changes')) {
        step.priority = 'high';
      }
      if (step.type === 'prompt' && step.name?.includes('Generate implementation plan')) {
        step.priority = 'high';
      }
      if (step.type === 'review') {
        step.priority = 'medium';
      }
    }
    return prioritized.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] || 1) - (order[b.priority] || 1);
    });
  }

  // Executes an agent pack: its persona drives the run, its skills are attached
  // from the curated index, and the deliverable is persisted onto the run. Steps
  // are fixed by the pack rather than planned, so a pack run cannot invent its
  // own edits — see agent-pack.mjs for why that matters.
  async executeAgentPack({ pack, goal, userId = null, trigger = 'agent' }) {
    const [projectContext, skills] = await Promise.all([
      buildProjectContext(this.projectRoot).catch(() => null),
      this.skills.select(goal).catch(() => []),
    ]);
    const steps = buildPackSteps({ pack, goal, skills, projectContext });
    const run = await this.createRun({
      goal,
      steps,
      trigger,
      userId,
      metadata: {
        agentId: pack.id,
        agentTitle: pack.title,
        agentRole: pack.role || null,
        skills: skills.map((s) => s.name),
      },
    });
    return run;
  }

  // Persists the deliverable on the run. `result` has no column of its own, so it
  // rides in metadata, which already round-trips through the DB — the same path
  // the worktree info uses. Every file the deliverable names is resolved against
  // the real project root and the ones that do not exist are reported, because a
  // confident deliverable citing invented paths is the main failure mode here.
  async attachDeliverable(runId, userId, deliverable) {
    const run = this.getRun(runId, userId);
    if (!run) return null;
    let citations = { checked: 0, missing: [] };
    try {
      citations = await auditCitations(deliverable, this.projectRoot);
    } catch (err) {
      this.log.warn(`Citation audit failed for ${runId}: ${err.message}`);
    }
    const metadata = {
      ...(run.metadata || {}),
      deliverable: {
        agentId: run.metadata?.agentId || null,
        agentTitle: run.metadata?.agentTitle || null,
        goal: run.goal,
        content: String(deliverable || '').slice(0, 200000),
        producedAt: new Date().toISOString(),
        citations,
        // Flag, do not rewrite: the text is what the agent said, and the point
        // is that a reader can see which of its claims did not survive checking.
        unverifiedPaths: citations.missing,
      },
    };
    if (userId) dbStorage.updateRunStatus(runId, { metadata });
    else {
      run.metadata = metadata;
      await this._persist();
    }
    this.emit('run:updated', this.getRun(runId, userId));
    return this.getRun(runId, userId);
  }

  async autoGenerateRun(goal, trigger = 'automatic', metadata = {}) {
    const steps = await this.generateSteps(goal, metadata);
    const prioritized = this.autoPrioritize(steps);
    const run = await this.createRun({
      goal,
      steps: prioritized,
      trigger,
      metadata,
      userId: metadata.userId,
      provider: metadata.provider || null,
    });
    return run;
  }

  async runTask(goal, metadata = {}) {
    const run = await this.autoGenerateRun(goal, 'cli', metadata);
    return await this.executeRun(run.id);
  }
}
