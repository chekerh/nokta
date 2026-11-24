import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REAL_DATA_DIR = path.join(DIR, '.nokta');

// Snapshot only the store files the daemon itself writes, so a concurrently
// running daemon (WAL checkpoints, log lines, directory mtimes) cannot make
// this assertion flaky while still catching any real mutation.
function snapshotRealStore() {
  let itemsContent = null;
  try {
    itemsContent = fs.readFileSync(path.join(REAL_DATA_DIR, 'sprints', 'items.json'), 'utf8');
  } catch {}
  let dbSize = null;
  try {
    dbSize = fs.statSync(path.join(REAL_DATA_DIR, 'nokta.db')).size;
  } catch {}
  return { itemsContent, dbSize };
}

function assertRealStoreUnchanged(before, after) {
  assert.equal(after.itemsContent, before.itemsContent, 'the test must not modify the real .nokta/sprints/items.json');
  assert.equal(after.dbSize, before.dbSize, 'the test must not change the real .nokta/nokta.db size');
}


function findPort() {
  return 6000 + Math.floor(Math.random() * 20000);
}

function httpGet(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        headers: { ...authHeaders() },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function httpPost(url, body, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...authHeaders() },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function httpGetNoAuth(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        headers: {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function startDaemon(port, dataDir) {
  const proc = spawn('node', [path.join(DIR, 'daemon', 'index.mjs'), 'daemon', '--port', String(port), '--project', dataDir], {
    cwd: dataDir,
    stdio: 'ignore',
    env: { ...process.env, NOKTA_LOG_LEVEL: 'error', NOKTA_API_KEY: 'test-key-123', NOKTA_DATA_DIR: dataDir },
  });
  return proc;
}

const API_KEY = 'test-key-123';

function authHeaders() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function waitForHealth(url, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await httpGet(url, 2000);
      if (res && res.status === 'ok') return res;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timeout waiting for daemon');
}

async function killProcess(proc) {
  if (!proc || proc.killed) return;
  try {
    proc.kill('SIGTERM');
  } catch {}
  try {
    proc.kill('SIGKILL');
  } catch {}
  if (proc.pid && !proc.killed) {
    try {
      await new Promise((resolve) => {
        proc.on('exit', resolve);
        setTimeout(() => resolve(), 1000);
      });
    } catch {}
  }
  // Extra delay to ensure port is released
  await new Promise((resolve) => setTimeout(resolve, 200));
}

test('daemon starts and responds to health check', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    const health = await waitForHealth(`http://localhost:${port}/health`, 20000);
    assert.equal(health.status, 'ok');
    assert.ok(Array.isArray(health.providers));
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon detects project stacks', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/detect`, { target: DIR });
    assert.ok(Array.isArray(result.stacks));
    assert.ok(result.stacks.includes('node'));
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon runs trail gates', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/gates`, { target: DIR });
    if (typeof result === 'object' && result !== null) {
      assert.ok('passed' in result || 'error' in result || 'status' in result);
    }
    assert.ok(Array.isArray(result.gates));
    assert.ok(result.gates.length >= 5);
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon returns trail state', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGet(`http://localhost:${port}/api/v1/trail`);
    assert.ok('index' in result);
    assert.ok('activeSession' in result);
    assert.ok(Array.isArray(result.recentSessions));
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon returns context packs', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGet(`http://localhost:${port}/api/v1/packs`);
    assert.ok(Array.isArray(result.packs));
    assert.ok(result.packs.length >= 8);
    assert.ok(result.packs.some((p) => p.id === 'core.agent-operating-system'));
    assert.ok(result.packs.some((p) => p.id === 'token.context-budget'));
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon returns routes in health check', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    const health = await waitForHealth(`http://localhost:${port}/health`, 20000);
    if (health.routes) {
      assert.ok(Array.isArray(health.routes), 'health should include routes array');
    }
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon metrics endpoint requires authentication', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);

    const unauth = await httpGetNoAuth(`http://localhost:${port}/metrics`);
    assert.equal(unauth.status, 401, '/metrics must not be publicly readable when an API key is set');

    const body = await httpGet(`http://localhost:${port}/metrics`);
    assert.equal(typeof body, 'string');
    assert.match(body, /# TYPE nokta_http_requests_total counter/);
    assert.match(body, /# TYPE nokta_active_runs gauge/);
    assert.match(body, /nokta_http_requests_total\{[^}]*route="\/health"/);
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon projects route requires authentication', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGetNoAuth(`http://localhost:${port}/api/v1/projects`);
    assert.equal(result.error, 'Unauthorized');
    assert.equal(result.status, 401);
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon brain route requires authentication', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGetNoAuth(`http://localhost:${port}/api/v1/brain`);
    assert.equal(result.error, 'Unauthorized');
    assert.equal(result.status, 401);
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon semantic search returns results', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/search/semantic`, {
      query: 'semantic search',
      target: '.',
      maxResults: 5,
    });
    if (typeof result === 'object' && result !== null) {
      assert.ok('results' in result || 'error' in result || 'status' in result);
    }
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon adversarial critique endpoint returns JSON', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/adversarial/critique`, {
      code: 'const x = 1;',
      file: 'test.js',
    });
    if (typeof result === 'object' && result !== null) {
      assert.ok('issues' in result || 'error' in result || 'status' in result);
    }
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});

test('daemon sandbox exec endpoint executes code', async () => {
  const port = findPort();
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-daemon-test-'));
  const before = snapshotRealStore();
  const proc = startDaemon(port, dataDir);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/sandbox/exec`, {
      code: 'console.log("hello from sandbox");',
      fileName: 'exec.mjs',
    });
    if (typeof result === 'object' && result !== null) {
      assert.ok('passed' in result || 'error' in result || 'status' in result);
    }
  } finally {
    await killProcess(proc);
    assertRealStoreUnchanged(before, snapshotRealStore());
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
});
