import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// connection.mjs caches the resolved path and handle on first use, so the data
// dir must be set before it is imported.
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-rundb-test-'));
process.env.NOKTA_DATA_DIR = dataDir;

const { prepare, closeDb } = await import('../daemon/db/connection.mjs');
const { migrate } = await import('../daemon/db/schema.mjs');
const dbStorage = await import('../daemon/agent/db-storage.mjs');
const { AgentOrchestrator, normalizeSteps, STEP_TYPES } = await import('../daemon/agent/orchestrator.mjs');
const { executeStep } = await import('../daemon/agent/executor.mjs');
const { canStartRun, getActiveRunCount, reapStaleRuns } = await import('../daemon/lib/run-limit.mjs');

migrate();

const USER_ID = 'usr_test_runs';
prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
  USER_ID,
  'runs@test.local',
  'Runs Test',
  'x',
);

// Dedicated user for the reaper tests so run counts stay isolated.
const REAPER_USER_ID = 'usr_test_reaper';
prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
  REAPER_USER_ID,
  'reaper@test.local',
  'Reaper Test',
  'x',
);

test.after(() => {
  closeDb();
});

function shellStep(command) {
  return { type: 'shell', name: 'noop', command, ignoreFailure: false };
}

test('getRunByIdAny resolves a DB-backed run without a userId', () => {
  const run = { ...baseRun(), user_id: USER_ID, steps: [shellStep('true')] };
  dbStorage.insertRun(run);

  assert.equal(dbStorage.getRunById(USER_ID, run.id).id, run.id);
  assert.equal(dbStorage.getRunByIdAny(run.id).id, run.id);
  assert.equal(dbStorage.getRunByIdAny('run_missing'), null);
});

test('DB-loaded steps expose their real payload fields (regression)', () => {
  const run = {
    ...baseRun(),
    user_id: USER_ID,
    steps: [{ type: 'shell', name: 'list', command: 'echo hydrated', cwd: 'sub' }],
  };
  dbStorage.insertRun(run);

  const [step] = dbStorage.getRunById(USER_ID, run.id).steps;
  // These live in the config column and must be merged back onto the row.
  assert.equal(step.command, 'echo hydrated');
  assert.equal(step.cwd, 'sub');
  assert.equal(step.type, 'shell');
});

test('executeRun finds a DB-backed run even without a userId (regression)', async () => {
  const run = { ...baseRun(), user_id: USER_ID, steps: [shellStep('echo db-backed-ok')] };
  dbStorage.insertRun(run);

  const orchestrator = new AgentOrchestrator(process.cwd(), { isolation: false });
  // No userId: previously threw "Run not found" because authenticated runs live
  // in SQLite, not in the in-memory array.
  const result = await orchestrator.executeRun(run.id);

  assert.equal(result.status, 'completed');
  assert.equal(result.error, null);
  assert.match(result.output[0].output, /db-backed-ok/);
  assert.equal(dbStorage.getRunById(USER_ID, run.id).status, 'completed');
});

test('executeRun scopes to the user when a userId is supplied', async () => {
  const run = { ...baseRun(), user_id: USER_ID, steps: [shellStep('true')] };
  dbStorage.insertRun(run);

  const other = new AgentOrchestrator(process.cwd(), { isolation: false });
  await assert.rejects(() => other.executeRun(run.id, 'usr_someone_else'), /Run not found/);
});

test('insertRun is atomic: a bad step leaves no orphaned run row (regression)', () => {
  const run = { ...baseRun(), user_id: USER_ID, steps: [{ name: 'missing-type' }] };

  assert.throws(() => dbStorage.insertRun(run));

  // The run row must not survive a failed step insert.
  assert.equal(dbStorage.getRunById(USER_ID, run.id), null);
});

test('a shell step with a missing cwd explains itself (regression)', async () => {
  // Regression: a nonexistent cwd surfaced as "spawnSync bash ENOENT", which
  // looks like bash is missing rather than the plan naming a bad directory.
  const run = { ...baseRun(), user_id: USER_ID };
  const result = await executeStep(run, { type: 'shell', command: 'pwd', cwd: 'no-such-dir' }, {});
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Working directory does not exist: no-such-dir/);
  assert.ok(!/spawnSync/.test(result.error));
});

test('a shell step rejects a non-string content edit (regression)', async () => {
  const result = await executeStep({ ...baseRun() }, { type: 'edit', file: 'x.txt' }, { projectRoot: os.tmpdir() });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /content is required/);
});

test('executeRun isolates a real run in a worktree (regression)', async () => {
  // Regression: runs edited the live tree in place. A plan once overwrote
  // daemon/server.mjs, destroying the running application. This asserts the
  // wiring, not just the helper.
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-isolated-'));
  const sh = (cmd) => execFileSync('bash', ['-c', cmd], { cwd: repo, encoding: 'utf8' });
  sh('git init -q -b main .');
  sh('git config user.email test@nokta.local && git config user.name Test');
  await fs.writeFile(path.join(repo, 'app.mjs'), 'ORIGINAL\n', 'utf8');
  sh('git add . && git commit -q -m initial');

  const run = {
    ...baseRun(),
    id: `run-iso-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER_ID,
    steps: [{ type: 'edit', name: 'clobber', file: 'app.mjs', content: 'CLOBBERED\n' }],
  };
  dbStorage.insertRun(run);

  const orchestrator = new AgentOrchestrator(repo, { isolation: true });
  const result = await orchestrator.executeRun(run.id, USER_ID);

  assert.equal(result.status, 'completed');
  assert.equal(
    await fs.readFile(path.join(repo, 'app.mjs'), 'utf8'),
    'ORIGINAL\n',
    'the live tree must be untouched by an isolated run',
  );

  const wt = (result.metadata || {}).worktree;
  assert.ok(wt, 'the run should record its worktree');
  assert.match(wt.branch, /^nokta\/run-iso-/);
  assert.equal(
    await fs.readFile(path.join(wt.path, 'app.mjs'), 'utf8'),
    'CLOBBERED\n',
    "the run's edit should be contained in the worktree",
  );

  // The persisted row carries the worktree too, so the worker and the UI agree.
  const stored = dbStorage.getRunById(USER_ID, run.id);
  assert.equal((stored.metadata || {}).worktree.branch, wt.branch);
});

test('planner prompt is grounded in the real repo and skill index (regression)', async () => {
  // Regression: the planner used to receive only JSON.stringify(metadata), so it
  // invented stacks and paths (it wrote src/health.ts into a plain-JS project).
  const prompts = [];
  const orchestrator = new AgentOrchestrator(process.cwd(), {
    skills: {
      async select() {
        return [{ name: 'api-design', description: 'REST API design patterns' }];
      },
    },
    chatHandler: {
      async handleChat(msgs) {
        prompts.push(...msgs.map((m) => m.content));
        return { content: '[]', provider: 'test', model: 'test' };
      },
    },
  });

  await orchestrator.generateSteps('Add a health endpoint');
  const prompt = prompts.join('\n');

  assert.match(prompt, /Add a health endpoint/);
  assert.match(prompt, /Repository context \(ground truth/, 'planner must receive repo grounding');
  assert.match(prompt, /\.mjs/, 'planner must see the real file types');
  assert.match(prompt, /api-design/, 'planner must see the selected skill');
  assert.match(prompt, /Never invent a stack/);
});

test('planner survives a missing chat handler and a bad skill index', async () => {
  const noChat = new AgentOrchestrator(process.cwd(), { isolation: false });
  assert.ok(Array.isArray(await noChat.generateSteps('goal')));
  assert.ok((await noChat.generateSteps('goal')).length > 0);

  const brokenSkills = new AgentOrchestrator(process.cwd(), {
    skills: {
      async select() {
        throw new Error('skill index unavailable');
      },
    },
    chatHandler: {
      async handleChat() {
        return { content: 'not json', provider: 'test', model: 'test' };
      },
    },
  });
  const steps = await brokenSkills.generateSteps('goal');
  assert.ok(steps.length > 0, 'should fall back to default steps');
});

test('normalizeSteps drops steps with a missing or unknown type', () => {
  const fallback = [shellStep('fallback')];

  assert.equal(normalizeSteps(undefined, fallback), fallback);
  assert.equal(normalizeSteps('not an array', fallback), fallback);
  assert.equal(normalizeSteps([{ name: 'no type' }], fallback), fallback);
  assert.equal(normalizeSteps([{ type: 'rm-rf' }], fallback), fallback);
  assert.equal(normalizeSteps([null, 'nope'], fallback), fallback);

  const mixed = normalizeSteps([{ type: 'nope' }, shellStep('echo keep'), { type: 'rm-rf' }], fallback);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].type, 'shell');
});

test('stored step results are surfaced on the run output (regression)', () => {
  const run = { ...baseRun(), user_id: USER_ID, steps: [shellStep('echo surfaced')] };
  dbStorage.insertRun(run);

  dbStorage.insertStepResult(run.id, 0, {
    status: 'completed',
    output: 'surfaced',
    error: null,
    durationMs: 12,
  });

  const stored = dbStorage.getRunById(USER_ID, run.id);
  assert.equal(stored.output.length, 1);
  assert.equal(stored.output[0].output, 'surfaced');
  assert.equal(stored.output[0].status, 'completed');
  assert.equal(stored.output[0].durationMs, 12);
});

test('abandoned runs are reaped so the API cannot wedge at the concurrency cap (regression)', () => {
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ids = [];
  for (let i = 0; i < 7; i++) {
    const run = { ...baseRun(), user_id: REAPER_USER_ID, status: 'created', steps: [shellStep('true')] };
    run.createdAt = stale;
    run.updatedAt = stale;
    dbStorage.insertRun(run);
    ids.push(run.id);
  }

  // All seven hold a slot, which is over the cap of 5. Without reaping the API
  // would reject every new run with 429 forever.
  assert.equal(getActiveRunCount(REAPER_USER_ID), 7);

  // canStartRun reaps first, so it self-heals instead of wedging.
  assert.equal(canStartRun(REAPER_USER_ID), true);
  assert.equal(getActiveRunCount(REAPER_USER_ID), 0);
  for (const id of ids) {
    assert.equal(dbStorage.getRunById(REAPER_USER_ID, id).status, 'failed');
  }
});

test('the reaper leaves in-flight and recently updated runs alone', () => {
  const fresh = { ...baseRun(), user_id: REAPER_USER_ID, status: 'running', steps: [shellStep('true')] };
  dbStorage.insertRun(fresh);

  assert.equal(reapStaleRuns(REAPER_USER_ID), 0);
  assert.equal(dbStorage.getRunById(REAPER_USER_ID, fresh.id).status, 'running');

  // Terminal states are never reaped.
  const done = { ...baseRun(), user_id: REAPER_USER_ID, status: 'completed', steps: [shellStep('true')] };
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  done.createdAt = old;
  done.updatedAt = old;
  dbStorage.insertRun(done);
  reapStaleRuns(REAPER_USER_ID);
  assert.equal(dbStorage.getRunById(REAPER_USER_ID, done.id).status, 'completed');
});

test('failRun records a terminal failure for a run that never executed', async () => {
  const run = { ...baseRun(), user_id: USER_ID, status: 'created', steps: [shellStep('true')] };
  dbStorage.insertRun(run);

  const orchestrator = new AgentOrchestrator(process.cwd(), { isolation: false });
  await orchestrator.failRun(run.id, USER_ID, new Error('worker exploded'));

  const stored = dbStorage.getRunById(USER_ID, run.id);
  assert.equal(stored.status, 'failed');
  assert.equal(stored.error, 'worker exploded');
});

test('listRuns hydrates step payloads and outputs for every run (regression)', () => {
  const a = { ...baseRun(), user_id: USER_ID, steps: [{ type: 'shell', name: 'a', command: 'echo one' }] };
  const b = { ...baseRun(), user_id: USER_ID, steps: [{ type: 'shell', name: 'b', command: 'echo two' }] };
  dbStorage.insertRun(a);
  dbStorage.insertRun(b);
  dbStorage.insertStepResult(b.id, 0, { status: 'completed', output: 'two', error: null, durationMs: 3 });

  const runs = dbStorage.getAllRuns(USER_ID, { limit: 50 });
  const byId = new Map(runs.map((r) => [r.id, r]));

  assert.equal(byId.get(a.id).steps[0].command, 'echo one');
  assert.equal(byId.get(a.id).output.length, 0, 'pending run has no output yet');
  assert.equal(byId.get(b.id).steps[0].command, 'echo two');
  assert.equal(byId.get(b.id).output[0].output, 'two');
});

test('failRun does not clobber a specific step error (regression)', async () => {
  const run = { ...baseRun(), user_id: USER_ID, status: 'created', steps: [shellStep('exit 3')] };
  dbStorage.insertRun(run);

  const orchestrator = new AgentOrchestrator(process.cwd(), { isolation: false });
  await orchestrator.executeRun(run.id, USER_ID);
  const stepError = dbStorage.getRunById(USER_ID, run.id).error;
  assert.equal(dbStorage.getRunById(USER_ID, run.id).status, 'failed');
  assert.match(stepError, /.+/, 'a step error was recorded');

  // The worker also reports a generic failure; the specific error must survive.
  await orchestrator.failRun(run.id, USER_ID, new Error('Worker exited with code 1'));
  assert.equal(dbStorage.getRunById(USER_ID, run.id).error, stepError);
});

test('failRun never throws, so error paths cannot become unhandled rejections', async () => {
  const orchestrator = new AgentOrchestrator(process.cwd(), { isolation: false });
  await assert.doesNotReject(() => orchestrator.failRun('run_missing', USER_ID, new Error('boom')));
  await assert.doesNotReject(() => orchestrator.failRun('run_missing', null, 'boom'));
});

test('every documented step type is executable', async () => {
  // `inspect` (read-only evidence gathering) was added with agent-pack
  // execution. This list is the documentation; the check against the executor's
  // real cases is what stops the two drifting apart in either direction.
  assert.deepEqual(STEP_TYPES, ['prompt', 'shell', 'scope', 'edit', 'review', 'pr', 'condition', 'inspect']);

  const executorSource = await fs.readFile(
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'daemon', 'agent', 'executor.mjs'),
    'utf8',
  );
  const handled = new Set([...executorSource.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]));
  assert.deepEqual(
    STEP_TYPES.filter((t) => !handled.has(t)),
    [],
    'every advertised step type needs a case in the executor',
  );
  assert.deepEqual(
    [...handled].filter((t) => !STEP_TYPES.includes(t)),
    [],
    'the executor handles a step type that is not advertised',
  );

  const run = { ...baseRun(), user_id: USER_ID, steps: [{ type: 'scope', name: 'scope' }] };
  dbStorage.insertRun(run);

  const orchestrator = new AgentOrchestrator(process.cwd(), { isolation: false });
  const result = await orchestrator.executeRun(run.id);
  assert.equal(result.status, 'completed');
});

test('a prompt step with no messages still gets a user turn (regression)', async () => {
  // Regression: an empty `messages: []` is truthy, so it used to win the
  // `step.messages || messages` fallback and the model received a system prompt
  // with no user turn at all. It then invented unrelated content.
  const seen = [];
  const run = { ...baseRun(), user_id: USER_ID, steps: [{ type: 'prompt', name: 'Report progress' }] };
  run.goal = 'Ship the auth feature';
  const chatHandler = {
    async handleChat(msgs) {
      seen.push(...msgs);
      return { content: 'ok', provider: 'test', model: 'test', tokensIn: 1, tokensOut: 1 };
    },
  };
  const result = await executeStep(run, run.steps[0], { chatHandler });

  assert.equal(result.status, 'completed');
  const user = seen.find((m) => m.role === 'user');
  assert.ok(user, 'expected a user turn to be synthesized');
  assert.match(user.content, /Ship the auth feature/);
  assert.match(user.content, /Report progress/);
});

test('a prompt step receives output from earlier steps (regression)', async () => {
  const seen = [];
  const run = {
    ...baseRun(),
    user_id: USER_ID,
    output: [
      { step: 'Analyze goal', type: 'prompt', status: 'completed', output: 'Found auth.js and login.js' },
      { step: 'failing', type: 'shell', status: 'failed', output: 'should not be included' },
    ],
  };
  const chatHandler = {
    async handleChat(msgs) {
      seen.push(...msgs);
      return { content: 'ok', provider: 'test', model: 'test', tokensIn: 1, tokensOut: 1 };
    },
  };
  await executeStep(run, { type: 'prompt', name: 'Write the plan' }, { chatHandler });

  const user = seen.find((m) => m.role === 'user');
  assert.match(user.content, /Found auth\.js and login\.js/);
  assert.ok(!user.content.includes('should not be included'), 'failed steps must not be fed forward');
});

function baseRun() {
  const now = new Date().toISOString();
  return {
    id: `run-test-${Math.random().toString(36).slice(2, 10)}`,
    user_id: null,
    project_root: process.cwd(),
    goal: 'test goal',
    status: 'created',
    trigger: 'manual',
    currentStep: 0,
    error: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}
