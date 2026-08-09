import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DecisionEngine } from '../daemon/lib/decision-engine.mjs';

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-decision-'));
}

test('DecisionEngine creates and retrieves decisions', async () => {
  const root = makeFixture();
  const engine = new DecisionEngine(root);

  const d = await engine.createDecision({
    type: 'architectural',
    title: 'Use SQLite for local data',
    description: 'SQLite with WAL mode is sufficient for single-node deployment',
    rationale: 'Simple, zero-config, portable',
    tags: ['database', 'architecture'],
  });
  assert.ok(d.id.startsWith('DEC-'));
  assert.equal(d.type, 'architectural');
  assert.equal(d.status, 'proposed');

  const found = await engine.getDecision(d.id);
  assert.equal(found.title, 'Use SQLite for local data');

  const updated = await engine.updateDecision(d.id, { status: 'accepted' });
  assert.equal(updated.status, 'accepted');

  const list = await engine.listDecisions();
  assert.equal(list.length, 1);

  const impact = await engine.getDecisionImpactAnalysis(d.id);
  assert.equal(impact.impactLevel, 'low');
  assert.equal(impact.linkedItems, 0);

  await engine.deleteDecision(d.id);
  try {
    await engine.getDecision(d.id);
    assert.fail('Should throw');
  } catch (e) {
    assert.ok(e.message.includes('not found'));
  }

  fs.rmSync(root, { recursive: true });
});

test('DecisionEngine listDecisions filters by type and status', async () => {
  const root = makeFixture();
  const engine = new DecisionEngine(root);

  await engine.createDecision({ type: 'architectural', title: 'A1' });
  await engine.createDecision({ type: 'ui-ux', title: 'U1' });
  await engine.createDecision({ type: 'security', title: 'S1' });
  await engine.createDecision({ type: 'architectural', title: 'A2', status: 'accepted' });

  const all = await engine.listDecisions();
  assert.equal(all.length, 4);

  const arch = await engine.listDecisions({ type: 'architectural' });
  assert.equal(arch.length, 2);

  const accepted = await engine.listDecisions({ status: 'accepted' });
  assert.equal(accepted.length, 1);

  fs.rmSync(root, { recursive: true });
});

test('DecisionEngine getDecisionTemplate returns template', async () => {
  const root = makeFixture();
  const engine = new DecisionEngine(root);
  const t = engine.getDecisionTemplate('ui-ux');
  assert.ok(t.rationale.includes('user'));
  const unknown = engine.getDecisionTemplate('unknown-type');
  assert.ok(unknown.rationale.length > 0);
  fs.rmSync(root, { recursive: true });
});
