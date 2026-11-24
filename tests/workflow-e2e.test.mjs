import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = 'test-key-123';
const REAL_ITEMS = path.join(DIR, '.nokta', 'sprints', 'items.json');
const REAL_DB = path.join(DIR, '.nokta', 'nokta.db');

// The daemon writes its state under .nokta; these tests must never touch the
// developer's real store. Only the planner's two files are compared: WAL
// sidecars and directory mtimes change whenever an unrelated daemon checkpoints.
function readRealStore() {
  const size = (file) => (fs.existsSync(file) ? fs.statSync(file).size : null);
  return {
    items: fs.existsSync(REAL_ITEMS) ? fs.readFileSync(REAL_ITEMS, 'utf8') : null,
    dbSize: size(REAL_DB),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function request(url, method = 'GET', body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          Authorization: `Bearer ${API_KEY}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await request(url, 'GET', null, 2000);
      if (res.status === 200 && res.body.status === 'ok') return res;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timeout waiting for daemon');
}

async function stop(proc) {
  if (proc.exitCode !== null) return;
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  proc.kill('SIGKILL');
  await exited;
}

// Runs `fn` against a daemon whose entire state lives in a throwaway data dir,
// then proves the real store was left alone.
async function withDaemon(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-e2e-'));
  const port = await freePort();
  const realStoreBefore = readRealStore();
  const proc = spawn(
    'node',
    [path.join(DIR, 'daemon', 'index.mjs'), 'daemon', '--port', String(port), '--project', dataDir],
    {
      cwd: dataDir,
      stdio: 'ignore',
      env: { ...process.env, NOKTA_LOG_LEVEL: 'error', NOKTA_API_KEY: API_KEY, NOKTA_DATA_DIR: dataDir },
    },
  );
  try {
    const base = `http://localhost:${port}`;
    await waitForHealth(`${base}/health`);
    await fn(base);
  } finally {
    await stop(proc);
    assert.deepEqual(readRealStore(), realStoreBefore, 'workflow-e2e must not touch the real .nokta store');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('workflow: detect → plan → agents → feedback end-to-end', async () => {
  await withDaemon(async (base) => {
    // Step 1: detect — analyze the project stack
    const detect = await request(`${base}/api/v1/detect`, 'POST', { target: DIR });
    assert.equal(detect.status, 200);
    assert.ok(detect.body.stacks.includes('node'));

    // Step 2: plan — create a planned item
    const plan = await request(`${base}/api/v1/planner/items`, 'POST', {
      type: 'task',
      title: 'Workflow E2E Test',
      priority: 'P1',
      labels: ['e2e'],
    });
    assert.equal(plan.status, 201);
    assert.ok(plan.body.id.startsWith('NOK-'));
    const itemId = plan.body.id;

    // Step 3: agents — recommend an agent for the planned work
    const agents = await request(`${base}/api/v1/agents/recommend`, 'POST', { prompt: `Implement ${plan.body.title}` }, 10000);
    assert.equal(agents.status, 200);
    assert.ok(['low', 'medium', 'high'].includes(agents.body.complexity));
    assert.ok('recommendedAgent' in agents.body);

    // Step 4: feedback — record human accept on the planned item
    const feedback = await request(`${base}/api/v1/planner/items/${itemId}/feedback`, 'POST', { action: 'accept' });
    assert.equal(feedback.status, 200);
    assert.equal(feedback.body.success, true);
    assert.ok(feedback.body.patterns.acceptedItems > 0);
    assert.ok(feedback.body.patterns.commonLabels.includes('e2e'));

    // Chain validation: the planned item is visible in planner summary
    const summary = await request(`${base}/api/v1/planner/summary`);
    assert.equal(summary.status, 200);
    assert.ok(summary.body.totalItems >= 1);
  });
});

test('workflow: plan item survives full agent recommendation cycle with estimate', async () => {
  await withDaemon(async (base) => {
    const plan = await request(`${base}/api/v1/planner/items`, 'POST', {
      type: 'task',
      title: 'Estimatable Workflow Item',
      description: 'Implement a feature',
    });
    assert.equal(plan.status, 201);

    const estimate = await request(`${base}/api/v1/planner/items/${plan.body.id}/estimate`, 'POST');
    assert.equal(estimate.status, 200);
    assert.equal(typeof estimate.body.storyPoints, 'number');

    const agents = await request(
      `${base}/api/v1/agents/recommend`,
      'POST',
      { prompt: 'Review the estimate for this task' },
      10000,
    );
    assert.equal(agents.status, 200);

    const deleted = await request(`${base}/api/v1/planner/items/${plan.body.id}`, 'DELETE');
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.success, true);
  });
});
