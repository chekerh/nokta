import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-health-test-'));
process.env.NOKTA_DATA_DIR = dataDir;

const { closeDb } = await import('../daemon/db/connection.mjs');
const { migrate } = await import('../daemon/db/schema.mjs');
const { checkDatabase, checkDisk, summarizeProviderHealth, checkAll } = await import('../daemon/lib/health.mjs');
const { registerHealthRoute } = await import('../daemon/routes/health.mjs');

migrate();

function mount(register) {
  const routes = new Map();
  const record =
    (method) =>
    (routePath, ...handlers) =>
      routes.set(`${method} ${routePath}`, handlers);
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

function invoke(chain, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(res);
        return this;
      },
    };
    let i = 0;
    const step = (err) => {
      if (err) {
        reject(err);
        return;
      }
      if (i >= chain.length) {
        resolve(res);
        return;
      }
      chain[i++](req, res, step);
    };
    step();
  });
}

test('database probe reports ok and the applied schema version', () => {
  const result = checkDatabase();
  assert.equal(result.status, 'ok');
  assert.equal(result.engine, 'sqlite');
  assert.ok(result.schemaVersion >= 5, 'migrations up to v5 applied');
});

test('disk probe reports the data directory with byte counts', async () => {
  const result = await checkDisk(dataDir);
  assert.equal(result.status, 'ok');
  assert.equal(result.path, dataDir);
  assert.ok(Number.isInteger(result.totalBytes) && result.totalBytes > 0);
  assert.ok(Number.isInteger(result.availableBytes) && result.availableBytes >= 0);
});

test('provider summary: no configured providers is a healthy state', () => {
  assert.deepEqual(summarizeProviderHealth({}), {
    status: 'ok',
    total: 0,
    healthy: 0,
    note: 'no providers configured',
  });
});

test('provider summary: all healthy is ok, some failing is degraded, all failing is error', () => {
  assert.equal(summarizeProviderHealth({ a: { status: 'ok' }, b: { status: 'ok' } }).status, 'ok');
  const degraded = summarizeProviderHealth({ a: { status: 'ok' }, b: { status: 'error' } });
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.healthy, 1);
  assert.equal(degraded.degraded, 1);
  assert.equal(summarizeProviderHealth({ a: { status: 'error' }, b: { status: 'error' } }).status, 'error');
});

test('checkAll aggregates db/disk/providers', async () => {
  const result = await checkAll({ providerManager: { health: async () => ({ ollama: { status: 'ok' } }) } });
  assert.equal(result.status, 'ok');
  assert.equal(result.database.status, 'ok');
  assert.equal(result.disk.status, 'ok');
  assert.equal(result.providers.status, 'ok');
});

test('/health exposes the dependency checks', async () => {
  const routes = mount((app) =>
    registerHealthRoute(app, {
      health: async () => ({ ollama: { status: 'ok' } }),
      list: () => [{ id: 'ollama', name: 'Ollama', enabled: true }],
      getDefault: () => ({ id: 'ollama' }),
    }),
  );
  const res = await invoke(routes.get('GET /health'), {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.dependencies.database.status, 'ok');
  assert.equal(res.body.dependencies.disk.status, 'ok');
  assert.equal(res.body.dependencies.providers.status, 'ok');
  assert.equal(res.body.providers[0].healthy, true);
});

test('/health stays ready when only a provider is failing', async () => {
  const routes = mount((app) =>
    registerHealthRoute(app, {
      health: async () => ({ openai: { status: 'error' } }),
      list: () => [{ id: 'openai', name: 'OpenAI', enabled: true }],
      getDefault: () => null,
    }),
  );
  const res = await invoke(routes.get('GET /health'), {});
  assert.equal(res.body.status, 'ok', 'provider failure must not flip top-level status');
  assert.equal(res.body.dependencies.providers.status, 'error');
  assert.equal(res.body.providers[0].healthy, false);
});

after(() => {
  closeDb();
});
