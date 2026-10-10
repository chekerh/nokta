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

const API_KEY = 'test-key-123';

function authHeaders() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function httpRequest(url, method, body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...authHeaders(),
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

function startDaemon(port) {
  const proc = spawn('node', [path.join(DIR, 'daemon', 'index.mjs'), 'daemon', '--port', String(port)], {
    cwd: DIR,
    stdio: 'ignore',
    env: { ...process.env, NOKTA_LOG_LEVEL: 'error', NOKTA_API_KEY: API_KEY },
  });
  return proc;
}

async function waitForHealth(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await httpRequest(url, 'GET', null, 2000);
      if (res.status === 200 && res.body.status === 'ok') return res;
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
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const BASE = (port) => `http://localhost:${port}`;

test('workflow: detect → plan → agents → feedback end-to-end', async () => {
  const port = findPort();
  const proc = startDaemon(port);
  try {
    await waitForHealth(`${BASE(port)}/health`, 20000);

    // Step 1: detect — analyze the project stack
    const detect = await httpRequest(`${BASE(port)}/api/v1/detect`, 'POST', { target: DIR });
    assert.equal(detect.status, 200);
    assert.ok(Array.isArray(detect.body.stacks));
    assert.ok(detect.body.stacks.includes('node'));

    // Step 2: plan — create a planned item
    const plan = await httpRequest(`${BASE(port)}/api/v1/planner/items`, 'POST', {
      type: 'task',
      title: 'Workflow E2E Test',
      priority: 'P1',
      labels: ['e2e'],
    });
    assert.equal(plan.status, 201);
    assert.ok(plan.body.id.startsWith('NOK-'));
    const itemId = plan.body.id;

    // Step 3: agents — recommend an agent for the planned work
    const agents = await httpRequest(
      `${BASE(port)}/api/v1/agents/recommend`,
      'POST',
      { prompt: `Implement ${plan.body.title}` },
      10000,
    );
    assert.equal(agents.status, 200);
    assert.ok('complexity' in agents.body);
    assert.ok('recommendedAgent' in agents.body);
    assert.ok(agents.body.complexity === 'low' || agents.body.complexity === 'medium' || agents.body.complexity === 'high');

    // Step 4: feedback — record human accept on the planned item
    const feedback = await httpRequest(`${BASE(port)}/api/v1/planner/items/${itemId}/feedback`, 'POST', {
      action: 'accept',
    });
    assert.equal(feedback.status, 200);
    assert.equal(feedback.body.success, true);
    assert.ok(feedback.body.patterns.acceptedItems > 0);
    assert.ok(feedback.body.patterns.commonLabels.includes('e2e'));

    // Chain validation: the planned item is visible in planner summary
    const summary = await httpRequest(`${BASE(port)}/api/v1/planner/summary`, 'GET');
    assert.equal(summary.status, 200);
    assert.ok(summary.body.totalItems >= 1);
  } finally {
    await killProcess(proc);
  }
});

test('workflow: plan item survives full agent recommendation cycle with estimate', async () => {
  const port = findPort();
  const proc = startDaemon(port);
  try {
    await waitForHealth(`${BASE(port)}/health`, 20000);

    const plan = await httpRequest(`${BASE(port)}/api/v1/planner/items`, 'POST', {
      type: 'task',
      title: 'Estimatable Workflow Item',
      description: 'Implement a feature',
    });
    assert.equal(plan.status, 201);

    const estimate = await httpRequest(`${BASE(port)}/api/v1/planner/items/${plan.body.id}/estimate`, 'POST');
    assert.equal(estimate.status, 200);
    assert.ok('storyPoints' in estimate.body);
    assert.ok(typeof estimate.body.storyPoints === 'number');

    const agents = await httpRequest(
      `${BASE(port)}/api/v1/agents/recommend`,
      'POST',
      { prompt: 'Review the estimate for this task' },
      10000,
    );
    assert.equal(agents.status, 200);

    const deleted = await httpRequest(`${BASE(port)}/api/v1/planner/items/${plan.body.id}`, 'DELETE');
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.success, true);
  } finally {
    await killProcess(proc);
  }
});
