import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SprintEngine } from '../daemon/lib/sprint-engine.mjs';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sprint-concurrency-worker.mjs');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-sprint-conc-'));
}

function runWorker(root, action, arg, delay) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [WORKER, root, action, arg], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DELAY: String(delay) },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`worker ${action} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split('\n').pop()));
      } catch {
        reject(new Error(`bad worker output: ${stdout} ${stderr}`));
      }
    });
  });
}

test('concurrent processes: delete in one does not resurrect when another creates', async () => {
  const root = makeRoot();
  const engine = new SprintEngine(root);
  const doomed = await engine.createItem({ type: 'task', title: 'doomed' });

  const [del, cre] = await Promise.all([
    runWorker(root, 'delete', doomed.id, 100),
    runWorker(root, 'create', 'new-item', 100),
  ]);
  assert.equal(del.ok, true);
  assert.equal(cre.ok, true);

  const fresh = new SprintEngine(root);
  const items = await fresh.listItems();
  assert.ok(!items.some((i) => i.id === doomed.id), 'deleted item resurrected');
  assert.ok(items.some((i) => i.title === 'new-item'), 'new item dropped');
  fs.rmSync(root, { recursive: true, force: true });
});

test('concurrent processes: two creates both survive', async () => {
  const root = makeRoot();
  const [a, b] = await Promise.all([
    runWorker(root, 'create', 'item-a', 100),
    runWorker(root, 'create', 'item-b', 100),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.id, b.id);

  const fresh = new SprintEngine(root);
  const items = await fresh.listItems();
  assert.equal(items.length, 2, 'expected both items');
  assert.ok(items.some((i) => i.title === 'item-a'));
  assert.ok(items.some((i) => i.title === 'item-b'));
  fs.rmSync(root, { recursive: true, force: true });
});
