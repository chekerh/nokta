import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FleetTransport } from '../daemon/lib/fleet.mjs';

async function tmpProject() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nokta-fleet-'));
  return dir;
}

test('fleet register -> list -> forget round-trip', async () => {
  const dir = await tmpProject();
  const fleet = new FleetTransport(dir);
  assert.deepEqual(await fleet.list(), []);

  const a = await fleet.register({ project: 'projA', provider: 'opencode' });
  assert.equal(a.project, 'projA');
  assert.equal(a.provider, 'opencode');

  const b = await fleet.register({ project: 'projA', provider: 'freebuff' });
  assert.equal(b.provider, 'freebuff');

  let sessions = await fleet.list();
  assert.equal(sessions.length, 2);
  assert.ok(sessions.some((s) => s.project === 'projA' && s.provider === 'opencode'));
  assert.ok(sessions.some((s) => s.project === 'projA' && s.provider === 'freebuff'));

  const removed = await fleet.forget('projA', 'freebuff');
  assert.equal(removed, 1);
  sessions = await fleet.list();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].provider, 'opencode');
});

test('fleet.run rejects freebuff as non-headless', async () => {
  const dir = await tmpProject();
  const fleet = new FleetTransport(dir);
  await assert.rejects(
    fleet.run('projA', 'hello', { provider: 'freebuff' }),
    /no headless mode/i,
  );
});

test('fleet.plan produces a prompt bundle and enqueue/queue round-trips', async () => {
  const dir = await tmpProject();
  const fleet = new FleetTransport(dir);
  const plan = await fleet.plan('projA', 'fix the kanban', { provider: 'opencode' });
  assert.ok(plan.prompt.includes('fix the kanban'));
  assert.equal(plan.provider, 'opencode');
  const enqueued = await fleet.enqueue(plan);
  assert.ok(enqueued.id);
  const items = await fleet.queueList();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, enqueued.id);
  assert.equal(items[0].status, 'pending');
});

test('fleet persists sessions to .nokta/fleet.json', async () => {
  const dir = await tmpProject();
  const fleet = new FleetTransport(dir);
  await fleet.register({ project: 'projA', provider: 'opencode' });
  const raw = JSON.parse(
    await fs.promises.readFile(path.join(dir, '.nokta', 'fleet.json'), 'utf8'),
  );
  assert.equal(raw.sessions.length, 1);
  assert.equal(raw.sessions[0].project, 'projA');
});
