import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerCostRoutes } from '../daemon/routes/costs.mjs';
import { registerAgentRoutes } from '../daemon/routes/agents.mjs';

// The pagination contract is shared: only when ?page= is present do the list
// endpoints slice their payloads and add a `pagination` object. These pin the
// contract on the routes that are cheap to mount with stubs; agent-runs does
// the same in agent-run-routes.test.mjs against its real harness.

function mount(register, ctx) {
  const routes = new Map();
  const app = {
    get: (p, ...h) => routes.set(`GET ${p}`, h),
    post: (p, ...h) => routes.set(`POST ${p}`, h),
    delete: (p, ...h) => routes.set(`DELETE ${p}`, h),
  };
  register(app, ...ctx);
  return routes;
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

async function invoke(chain, req) {
  const res = fakeRes();
  let error = null;
  chain[chain.length - 1](req, res, (err) => {
    if (err) error = err;
  });
  // loadAgentPacks() reads through the fs threadpool, whose callback is a
  // poll-phase macrotask — a single timer tick can observe an empty body.
  // Wait (with a dead-line) until the handler settles instead of assuming one
  // microtask drain is enough.
  const deadline = Date.now() + 1000;
  while (res.body === null && !error && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (error) throw error;
  return res;
}

const seededEntries = Array.from({ length: 25 }, (_, i) => ({
  id: `cost-${i + 1}`,
  totalCost: (i + 1) * 10,
}));
const costTrackerStub = {
  getCosts: async () => seededEntries,
  getSummary: async () => ({}),
  getMonthlySpend: async () => ([]),
  listPricing: () => ({}),
  estimateCost: async () => ({}),
};

const costRoutes = mount(registerCostRoutes, [costTrackerStub]);

test('costs: ?page=2&limit=10 returns that page and keeps whole-range total', async () => {
  const res = await invoke(costRoutes.get('GET /api/v1/costs'), {
    query: { page: '2', limit: '10' },
  });
  assert.equal(res.body.entries.length, 10);
  assert.equal(res.body.entries[0].id, 'cost-11');
  assert.equal(res.body.total, seededEntries.reduce((s, e) => s + e.totalCost, 0));
  assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 25, totalPages: 3 });
});

test('costs: no ?page returns everything with no pagination field', async () => {
  const res = await invoke(costRoutes.get('GET /api/v1/costs'), { query: {} });
  assert.equal(res.body.entries.length, 25);
  assert.equal(res.body.pagination, undefined);
});

const providerManagerStub = {
  list: () => [],
  health: async () => ({}),
  get: () => null,
};

const agentRoutes = mount(registerAgentRoutes, [providerManagerStub, { info() {}, error() {} }, null, null]);

test('agents: ?page=1&limit=5 pages the agent list', async () => {
  const res = await invoke(agentRoutes.get('GET /api/v1/agents'), {
    query: { page: '1', limit: '5' },
  });
  assert.ok(res.body.agents.length <= 5, 'page is capped at limit');
  assert.deepEqual(res.body.pagination, {
    page: 1,
    limit: 5,
    total: res.body.fleet.length,
    totalPages: Math.max(1, Math.ceil(res.body.fleet.length / 5)),
  });
  assert.ok(Array.isArray(res.body.fleet));
});

test('agents: ?page=2 does not repeat page 1', async () => {
  const [p1, p2] = await Promise.all([
    invoke(agentRoutes.get('GET /api/v1/agents'), { query: { page: '1', limit: '5' } }),
    invoke(agentRoutes.get('GET /api/v1/agents'), { query: { page: '2', limit: '5' } }),
  ]);
  const ids1 = p1.body.agents.map((a) => a.id);
  const ids2 = p2.body.agents.map((a) => a.id);
  for (const id of ids2) assert.ok(!ids1.includes(id), `page 2 repeats page 1 id ${id}`);
});
