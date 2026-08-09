import EventEmitter from 'node:events';
import { createRunConfig, executeStep } from './executor.mjs';
import * as fileStorage from './storage.mjs';
import * as dbStorage from './db-storage.mjs';

export class AgentOrchestrator extends EventEmitter {
  constructor(projectRoot, options = {}) {
    super();
    this.projectRoot = projectRoot;
    this.runs = [];
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.providerManager = options.providerManager || null;
    this.chatHandler = options.chatHandler || null;
    this.sprintEngine = options.sprintEngine || null;
    this._loaded = false;
    this._activeExecutions = new Map();
  }

  async load() {
    if (this._loaded) return;
    this.runs = await fileStorage.getAllRuns(this.projectRoot);
    this._loaded = true;
  }

  async _persist() {
    if (this._useDb) return;
    await fileStorage.saveRuns(this.projectRoot, this.runs);
  }

  _use(userId) {
    return userId ? 'db' : 'file';
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
    return this.runs.find((r) => r.id === runId) || null;
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

  async executeRun(runId) {
    await this.load();
    const run = this.getRun(runId);
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

    const context = {
      chatHandler: this.chatHandler,
      sprintEngine: this.sprintEngine,
      projectRoot: this.projectRoot,
      providerManager: this.providerManager,
    };

    for (let i = 0; i < run.steps.length; i++) {
      if (executionCtx.aborted) {
        run.status = 'cancelled';
        break;
      }

      run.currentStep = i;
      const step = run.steps[i];
      this.emit('run:step-start', { runId, stepIndex: i, step });

      let stepResult;
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

  async generateSteps(goal, context = {}) {
    if (!this.chatHandler) {
      return this._generateDefaultSteps(goal);
    }
    const prompt = `You are a software engineering agent planner. Given a goal and project context, generate a sequence of steps to accomplish the goal.

Available step types:
- prompt: Call an AI model with messages. Fields: messages (array of {role, content}), systemPrompt (optional).
- shell: Run a shell command. Fields: command (string), cwd (optional), timeout (ms, default 30000), ignoreFailure (optional).
- edit: Edit a file. Fields: file (path relative to project root), content (new content), oldString (optional, for replacement).
- review: Review current changes. Fields: branch (optional, default HEAD), diff (optional).
- pr: Create a GitHub PR. Fields: owner, repo, title, body, head, base.
- condition: Check a condition. Fields: condition (string like "git:hasChanges"), failOnFalse (optional).

Respond with ONLY a JSON array of steps. No explanation. Each step must have a "type" field and the relevant fields for that type.

Goal: ${goal}

Project context: ${JSON.stringify(context)}`;

    try {
      const result = await this.chatHandler.handleChat([{ role: 'user', content: prompt }], {
        stream: false,
        temperature: 0.3,
      });
      const content = result.content.trim();
      const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
      const steps = JSON.parse(cleaned);
      return Array.isArray(steps) ? steps : this._generateDefaultSteps(goal);
    } catch {
      return this._generateDefaultSteps(goal);
    }
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
    ];
  }

  async autoGenerateRun(goal, trigger = 'automatic', metadata = {}) {
    const steps = await this.generateSteps(goal, metadata);
    const run = await this.createRun({
      goal,
      steps,
      trigger,
      metadata,
      userId: metadata.userId,
    });
    return run;
  }
}
