import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-health-test-'));
process.env.NOKTA_DATA_DIR = dataDir;

const { closeDb } = await import('../daemon/db/connection.mjs');
const { migrate } = await import('../daemon/db/schema.mjs');
const { checkDatabase, checkDisk, classifyDisk, summarizeProviderHealth, checkAll } =
  await import('../daemon/lib/health.mjs');
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
  assert.equal(result.totalMigrations, 5);
});

test('database probe fails gracefully when the DB cannot be opened', async () => {
  closeDb();
  // Make the db path unopenable by placing a directory where nokta.db should be.
  const dbPath = path.join(dataDir, 'nokta.db');
  await fs.rm(dbPath, { force: true });
  await fs.mkdir(dbPath);
  const result = checkDatabase();
  assert.equal(result.status, 'error');
  assert.ok(result.error);
  await fs.rmdir(dbPath);
  migrate(); // restore a healthy DB for the remaining tests
  assert.equal(checkDatabase().status, 'ok');
});

test('disk probe reports the data directory with byte counts', async () => {
  const result = await checkDisk(dataDir);
  assert.equal(result.status, 'ok');
  assert.equal(result.path, dataDir);
  assert.ok(Number.isInteger(result.totalBytes) && result.totalBytes > 0);
  assert.ok(Number.isInteger(result.availableBytes) && result.availableBytes >= 0);
});

test('classifyDisk thresholds: warn below 512MB or 5%, ok at the boundary', () => {
  assert.equal(classifyDisk(10 * 1024 ** 3, 512 * 1024 ** 2), 'ok', 'exactly 512MB free is ok');
  assert.equal(classifyDisk(10 * 1024 ** 3, 512 * 1024 ** 2 - 1), 'warn', 'one byte under 512MB warns');
  assert.equal(classifyDisk(100 * 1024 ** 3, 5 * 1024 ** 3), 'ok', 'exactly 5% free is ok');
  assert.equal(classifyDisk(100 * 1024 ** 3, 4.9 * 1024 ** 3), 'warn', 'under 5% warns');
  assert.equal(classifyDisk(0, 0), 'ok', 'unmeasurable volume does not alarm');
});

test('provider summary: no configured providers is a healthy state', () => {
  assert.deepEqual(summarizeProviderHealth({}), {
    status: 'ok',
    total: 0,
    healthy: 0,
    degraded: 0,
    note: 'no providers configured',
  });
});

test('provider summary: skipped providers do not count as failing', () => {
  assert.deepEqual(summarizeProviderHealth({ a: { status: 'skipped', provider: 'a' } }), {
    status: 'ok',
    total: 1,
    healthy: 0,
    degraded: 0,
    note: 'all providers skipped (disabled)',
  });
});

test('provider summary: all healthy is ok, some failing is degraded, all failing is error', () => {
  assert.deepEqual(summarizeProviderHealth({ a: { status: 'ok' }, b: { status: 'ok' } }), {
    status: 'ok',
    total: 2,
    healthy: 2,
    degraded: 0,
    note: null,
  });
  const degraded = summarizeProviderHealth({ a: { status: 'ok' }, b: { status: 'error' } });
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.healthy, 1);
  assert.equal(degraded.degraded, 1);
  assert.match(degraded.note, /1 of 2 enabled providers failing/);
  assert.equal(summarizeProviderHealth({ a: { status: 'error' }, b: { status: 'error' } }).status, 'error');
});

test('checkAll aggregates db/disk/providers', async () => {
  const result = await checkAll({ providerManager: { health: async () => ({ ollama: { status: 'ok' } }) } });
  assert.equal(result.status, 'ok');
  assert.equal(result.database.status, 'ok');
  assert.equal(result.disk.status, 'ok');
  assert.equal(result.providers.status, 'ok');
});

test('checkAll reports a failed provider sweep without throwing', async () => {
  const result = await checkAll({ providerManager: { health: () => Promise.reject(new Error('boom')) } });
  assert.equal(result.dependencies?.status ?? result.status, 'degraded');
  assert.equal(result.providers.status, 'error');
  assert.match(result.providers.note, /sweep failed/);
});

test('checkAll treats a null provider health as a failed sweep', async () => {
  const result = await checkAll({
    providerManager: { health: async () => ({}) },
    providerHealth: null,
  });
  assert.equal(result.providers.status, 'error');
  assert.equal(result.status, 'degraded');
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

test('/health survives a provider sweep that rejects', async () => {
  const routes = mount((app) =>
    registerHealthRoute(app, {
      health: () => Promise.reject(new Error('connection refused')),
      list: () => [{ id: 'openai', name: 'OpenAI', enabled: true }],
      getDefault: () => null,
    }),
  );
  const res = await invoke(routes.get('GET /health'), {});
  assert.equal(res.statusCode, 200, 'the endpoint must not 500 on a bad sweep');
  assert.equal(res.body.status, 'ok', 'db+disk healthy, so instance stays ready');
  assert.equal(res.body.dependencies.providers.status, 'error');
  assert.equal(res.body.providers[0].healthy, false);
});

after(async () => {
  closeDb();
  await fs.rm(dataDir, { recursive: true, force: true });
});
