import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findPort() {
  return 6000 + Math.floor(Math.random() * 20000);
}

function httpGet(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
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
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
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

function startDaemon(port) {
  const proc = spawn('node', [path.join(DIR, 'daemon', 'index.mjs'), 'daemon', '--port', String(port)], {
    cwd: DIR,
    stdio: 'ignore',
    env: { ...process.env, NOKTA_LOG_LEVEL: 'error' },
  });
  return proc;
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
  const proc = startDaemon(port);
  try {
    const health = await waitForHealth(`http://localhost:${port}/health`, 20000);
    assert.equal(health.status, 'ok');
    assert.ok(Array.isArray(health.providers));
  } finally {
    await killProcess(proc);
  }
});

test('daemon detects project stacks', async () => {
  const port = findPort();
  const proc = startDaemon(port);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpPost(`http://localhost:${port}/api/v1/detect`, { target: DIR });
    assert.ok(Array.isArray(result.stacks));
    assert.ok(result.stacks.includes('node'));
  } finally {
    await killProcess(proc);
  }
});

test('daemon runs trail gates', async () => {
  const port = findPort();
  const proc = startDaemon(port);
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
  }
});

test('daemon returns trail state', async () => {
  const port = findPort();
  const proc = startDaemon(port);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGet(`http://localhost:${port}/api/v1/trail`);
    assert.ok('index' in result);
    assert.ok('activeSession' in result);
    assert.ok(Array.isArray(result.recentSessions));
  } finally {
    await killProcess(proc);
  }
});

test('daemon returns context packs', async () => {
  const port = findPort();
  const proc = startDaemon(port);
  try {
    await waitForHealth(`http://localhost:${port}/health`, 20000);
    const result = await httpGet(`http://localhost:${port}/api/v1/packs`);
    assert.ok(Array.isArray(result.packs));
    assert.ok(result.packs.length >= 8);
    assert.ok(result.packs.some((p) => p.id === 'core.agent-operating-system'));
    assert.ok(result.packs.some((p) => p.id === 'token.context-budget'));
  } finally {
    await killProcess(proc);
  }
});
