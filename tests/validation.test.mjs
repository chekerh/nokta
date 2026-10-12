import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateBody, z } from '../daemon/lib/validate.mjs';
import { AppError } from '../daemon/lib/route-utils.mjs';
import { AgentRunCreateSchema, PlannerBrainstormSchema } from '../daemon/lib/schemas.mjs';
import { registerGateRoutes } from '../daemon/routes/gates.mjs';

// Minimal fake Express app that records each route's handler chain in
// registration order, so a test can assert on the middleware that runs.
function mount(register) {
  const routes = new Map();
  const record = (method) => (routePath, ...handlers) => routes.set(`${method} ${routePath}`, handlers);
  const app = {
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    patch: record('PATCH'),
    delete: record('DELETE'),
  };
  register(app);
  return routes;
}

// Run a full handler chain the way Express would: each middleware receives a
// `next` that advances to the next one. asyncHandler is not an async function,
// so once we reach the terminal handler we give the microtask queue a tick and
// resolve with whatever the fake res accumulated.
function runChain(chain, req, res) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const step = (err) => {
      if (err) {
        reject(err);
        return;
      }
      if (i >= chain.length) {
        setTimeout(() => resolve(res), 0);
        return;
      }
      chain[i++](req, res, step);
      if (i >= chain.length) setTimeout(() => resolve(res), 0);
    };
    step();
  });
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

test('validateBody replaces req.body with the parsed and defaulted value', () => {
  const schema = z.object({ count: z.number().default(7), label: z.string().nullish() });
  const req = { body: { label: 'x' } };
  let nextErr = 'unset';
  validateBody(schema)(req, {}, (err) => {
    nextErr = err;
  });
  assert.equal(nextErr, undefined);
  assert.deepEqual(req.body, { count: 7, label: 'x' });
});

test('validateBody treats a missing body as an empty object', () => {
  const schema = z.object({ optional: z.string().nullish() }).catchall(z.unknown());
  const req = {};
  let nextErr = 'unset';
  validateBody(schema)(req, {}, (err) => {
    nextErr = err;
  });
  assert.equal(nextErr, undefined);
  assert.deepEqual(req.body, {});
});

test('validateBody raises a 400 AppError carrying per-field issues', () => {
  const schema = z.object({ n: z.number() });
  let captured = null;
  validateBody(schema)({ body: { n: 'nope' } }, {}, (err) => {
    captured = err;
  });
  assert.ok(captured instanceof AppError);
  assert.equal(captured.status, 400);
  assert.equal(captured.message, 'Invalid request body');
  assert.ok(Array.isArray(captured.details.issues));
  assert.equal(captured.details.issues[0].path, 'n');
  assert.equal(typeof captured.details.issues[0].message, 'string');
});

test('route chains run validateBody before the terminal handler', async () => {
  const routes = mount((app) =>
    registerGateRoutes(app, {
      tokenLimit: 1000,
      severity: {},
      checkToken: async () => ({ status: 'pass', message: 'ok' }),
      checkSecurity: async () => ({ status: 'pass', message: 'ok' }),
      checkVerification: async () => ({ status: 'pass', message: 'ok' }),
      evaluateAll: async () => ({ ok: true }),
    }),
  );

  const chain = routes.get('POST /api/v1/gates/evaluate');
  assert.ok(chain, 'route not registered');
  assert.ok(
    chain.some((fn) => fn.name === 'validateBodyMiddleware'),
    'validateBody is missing from the route chain',
  );

  await assert.rejects(
    () => runChain(chain, { body: {} }, fakeRes()),
    (err) => err instanceof AppError && err.status === 400,
  );

  const res = await runChain(chain, { body: { messages: [] } }, fakeRes());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('agent-run create schema still lets the route own its "goal or steps" error', () => {
  // The schema permits both fields to be absent so the route can respond with
  // its own message instead of a generic validation error.
  assert.equal(AgentRunCreateSchema.safeParse({}).success, true);
  assert.equal(AgentRunCreateSchema.safeParse({ goal: 'do it' }).success, true);
  assert.equal(AgentRunCreateSchema.safeParse({ steps: [{ type: 'prompt' }] }).success, true);
  assert.equal(AgentRunCreateSchema.safeParse({ steps: 'not-an-array' }).success, false);
});

test('planner brainstorm schema rejects an empty prompts.features', () => {
  assert.equal(PlannerBrainstormSchema.safeParse({ context: {}, prompts: {} }).success, false);
  assert.equal(PlannerBrainstormSchema.safeParse({ context: {}, prompts: { features: '' } }).success, false);
  assert.equal(PlannerBrainstormSchema.safeParse({ context: {}, prompts: { features: 'dark mode' } }).success, true);
});
