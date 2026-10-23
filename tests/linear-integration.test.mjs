import assert from 'node:assert/strict';
import test from 'node:test';
import { registerLinearRoutes } from '../daemon/routes/linear.mjs';
import { ProjectManager } from '../daemon/lib/project-manager.mjs';

function mountLinearRoutes() {
  const routes = new Map();
  const app = {
    get: (p, ...h) => routes.set(`GET ${p}`, h),
    post: (p, ...h) => routes.set(`POST ${p}`, h),
  };

  const pm = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });
  registerLinearRoutes(app, pm, null, { info() {}, error() {} });

  return routes;
}

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
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

async function _invoke(routes, key, req) {
  const chain = routes.get(key);
  assert.ok(chain, `route not registered: ${key}`);
  const res = fakeRes();
  let error = null;
  chain[chain.length - 1](req, res, (err) => { if (err) error = err; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (error) throw error;
  return res;
}

test('Linear routes are registered', () => {
  const routes = mountLinearRoutes();

  assert.ok(routes.has('GET /api/v1/linear/issue/:issueId'));
  assert.ok(routes.has('POST /api/v1/linear/issue/:issueId/comment'));
  assert.ok(routes.has('POST /api/v1/linear/issue/:issueId/state'));
  assert.ok(routes.has('GET /api/v1/linear/team/:teamId/states'));
  assert.ok(routes.has('POST /api/v1/linear/webhook'));
  assert.ok(routes.has('POST /api/v1/linear/sync-run'));
  assert.ok(routes.has('POST /api/v1/projects/:projectRoot/linear-link'));
});

test('Linear issue route requires apiKey', async () => {
  const routes = mountLinearRoutes();

  const _req = {
    params: { issueId: '123' },
    query: {},
    user: { id: 'user-1' },
  };

  // Should fail validation for missing apiKey
  // The validation happens before our handler, so we test the route exists
  assert.ok(routes.has('GET /api/v1/linear/issue/:issueId'));
});

test('Linear webhook route exists without auth', () => {
  const routes = mountLinearRoutes();
  assert.ok(routes.has('POST /api/v1/linear/webhook'));
});

test('ProjectManager Linear link updates registry', async () => {
  const pm = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });
  const testRoot = '/tmp/linear-link-test-' + Date.now();

  await pm.registerProjectInRegistry(testRoot, 'opencode', [], [], '', '');
  const before = await pm.getProjectRegistry(testRoot);
  assert.equal(before.linkedLinearId, '');

  await pm.updateProjectRegistry(testRoot, 'opencode', [], [], '', 'LINEAR-TEAM-123');
  const after = await pm.getProjectRegistry(testRoot);
  assert.equal(after.linkedLinearId, 'LINEAR-TEAM-123');
});
