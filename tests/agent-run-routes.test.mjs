import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerAgentRunRoutes } from '../daemon/routes/agent-runs.mjs';

// Creating a run returned 201 and started nothing, so a POST followed by
// waiting produced a run stuck in `created` forever — enqueueing only happened
// on the separate /execute route. These pin the corrected contract, including
// the `draft: true` opt-out for callers that only want to persist a plan.

function mountRoutes(orchestrator, jobQueue) {
  const routes = new Map();
  const app = {
    get: (p, ...h) => routes.set(`GET ${p}`, h),
    post: (p, ...h) => routes.set(`POST ${p}`, h),
    delete: (p, ...h) => routes.set(`DELETE ${p}`, h),
    put: (p, ...h) => routes.set(`PUT ${p}`, h),
  };
  registerAgentRunRoutes(app, orchestrator, { info() {}, error() {}, warn() {} }, jobQueue);
  return routes;
}

// The handlers are wrapped in authMiddleware, which needs a real signed token
// and a users table. We are testing the route's own logic, so invoke the last
// handler (the asyncHandler-wrapped one) directly.
//
// asyncHandler is deliberately not an async function: it fires the promise and
// forwards any rejection to `next`, so the call itself never throws and never
// returns a promise. Capture `next` and let the microtask queue drain instead.
async function invoke(routes, key, req) {
  const chain = routes.get(key);
  assert.ok(chain, `route not registered: ${key}`);
  const res = fakeRes();
  let error = null;
  chain[chain.length - 1](req, res, (err) => {
    if (err) error = err;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (error) throw error;
  return res;
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function stubOrchestrator(overrides = {}) {
  return {
    projectRoot: '/repo',
    load: async () => {},
    generateSteps: async () => [{ type: 'prompt', name: 'do it' }],
    createRun: async (args) => ({ id: 'run-1', status: 'created', steps: args.steps }),
    getRun: () => ({ id: 'run-1', status: 'created' }),
    executeRun: async () => ({ status: 'completed' }),
    failRun: async () => {},
    ...overrides,
  };
}

test('POST /api/v1/agent-runs starts the run', async () => {
  const enqueued = [];
  const jobQueue = { enqueue: async (id, payload) => void enqueued.push([id, payload]), getStatus: () => null };
  const routes = mountRoutes(stubOrchestrator(), jobQueue);

  const res = await invoke(routes, 'POST /api/v1/agent-runs', {
    body: { goal: 'add a health endpoint' },
    user: null,
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.started, true);
  assert.equal(res.body.run.status, 'running', 'the response must not claim a stalled run is running');
  assert.equal(enqueued.length, 1, 'the run must be dispatched');
  assert.equal(enqueued[0][0], 'run-1');
  assert.equal(enqueued[0][1].projectRoot, '/repo');
});

test('POST /api/v1/agent-runs with draft: true persists without dispatching', async () => {
  const enqueued = [];
  const jobQueue = { enqueue: async (id) => void enqueued.push(id), getStatus: () => null };
  const routes = mountRoutes(stubOrchestrator(), jobQueue);

  const res = await invoke(routes, 'POST /api/v1/agent-runs', {
    body: { goal: 'plan only', draft: true },
    user: null,
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.started, false);
  assert.equal(res.body.run.status, 'created', 'a draft stays in created');
  assert.equal(enqueued.length, 0, 'a draft must not be dispatched');
});

test('POST /api/v1/agent-runs without a job queue runs inline', async () => {
  const executed = [];
  const orchestrator = stubOrchestrator({ executeRun: async (id) => void executed.push(id) });
  const routes = mountRoutes(orchestrator, null);

  const res = await invoke(routes, 'POST /api/v1/agent-runs', { body: { goal: 'go' }, user: null });
  await new Promise((r) => setTimeout(r, 5));

  assert.equal(res.body.started, true);
  assert.deepEqual(executed, ['run-1']);
});

test('POST /api/v1/agent-runs still generates steps when none are supplied', async () => {
  let asked = null;
  const orchestrator = stubOrchestrator({
    generateSteps: async (goal) => {
      asked = goal;
      return [{ type: 'scope', allowedFiles: ['a.mjs'] }];
    },
  });
  const routes = mountRoutes(orchestrator, { enqueue: async () => {}, getStatus: () => null });

  const res = await invoke(routes, 'POST /api/v1/agent-runs', { body: { goal: 'my goal' }, user: null });

  assert.equal(asked, 'my goal');
  assert.deepEqual(res.body.run.steps, [{ type: 'scope', allowedFiles: ['a.mjs'] }]);
});

test('POST /api/v1/agent-runs rejects a request with neither goal nor steps', async () => {
  const routes = mountRoutes(stubOrchestrator(), { enqueue: async () => {}, getStatus: () => null });

  await assert.rejects(
    () => invoke(routes, 'POST /api/v1/agent-runs', { body: {}, user: null }),
    /goal or steps is required/,
  );
});

test('POST /:id/execute refuses to start a run that is already running', async () => {
  const orchestrator = stubOrchestrator({ getRun: () => ({ id: 'run-1', status: 'running' }) });
  const routes = mountRoutes(orchestrator, { enqueue: async () => {}, getStatus: () => null });

  // Re-executing a live run would let a caller double-run it and race the worktree.
  await assert.rejects(
    () => invoke(routes, 'POST /api/v1/agent-runs/:id/execute', { params: { id: 'run-1' }, user: null }),
    /already running/,
  );
});

test('POST /:id/execute refuses a queued run too', async () => {
  const orchestrator = stubOrchestrator({ getRun: () => ({ id: 'run-1', status: 'queued' }) });
  const routes = mountRoutes(orchestrator, { enqueue: async () => {}, getStatus: () => null });

  await assert.rejects(
    () => invoke(routes, 'POST /api/v1/agent-runs/:id/execute', { params: { id: 'run-1' }, user: null }),
    /already queued/,
  );
});

test('POST /:id/execute still starts a draft run', async () => {
  const enqueued = [];
  const orchestrator = stubOrchestrator({ getRun: () => ({ id: 'run-1', status: 'created' }) });
  const routes = mountRoutes(orchestrator, { enqueue: async (id) => void enqueued.push(id), getStatus: () => null });

  const res = await invoke(routes, 'POST /api/v1/agent-runs/:id/execute', { params: { id: 'run-1' }, user: null });

  assert.deepEqual(enqueued, ['run-1']);
  assert.equal(res.body.run.status, 'running');
});

test('POST /api/v1/agent-runs/auto reports that it started', async () => {
  const enqueued = [];
  const orchestrator = stubOrchestrator({ autoGenerateRun: async () => ({ id: 'run-auto', status: 'created' }) });
  const routes = mountRoutes(orchestrator, { enqueue: async (id) => void enqueued.push(id), getStatus: () => null });

  const res = await invoke(routes, 'POST /api/v1/agent-runs/auto', { body: { goal: 'go' }, user: null });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.started, true);
  assert.deepEqual(enqueued, ['run-auto']);
});

test('a dispatch failure marks the run failed rather than leaving it stuck', async () => {
  const failed = [];
  const orchestrator = stubOrchestrator({ failRun: async (id, user, err) => void failed.push([id, err.message]) });
  const jobQueue = {
    enqueue: async () => {
      throw new Error('queue is full');
    },
    getStatus: () => null,
  };
  const routes = mountRoutes(orchestrator, jobQueue);

  const res = await invoke(routes, 'POST /api/v1/agent-runs', { body: { goal: 'go' }, user: null });
  // The rejection is handled asynchronously inside dispatch.
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(res.statusCode, 201, 'dispatch failures are async and do not change the create response');
  assert.deepEqual(failed, [['run-1', 'queue is full']]);
});
