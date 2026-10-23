import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdapterHeadless } from '../daemon/lib/agent-launcher.mjs';
import { ProjectManager } from '../daemon/lib/project-manager.mjs';

test('isAdapterHeadless', () => {
  assert.equal(isAdapterHeadless('opencode'), true);
  assert.equal(isAdapterHeadless('OPENCODE'), true);
  assert.equal(isAdapterHeadless('claude'), false);
  assert.equal(isAdapterHeadless('cursor'), false);
  assert.equal(isAdapterHeadless('unknown'), false);
});

test('ProjectManager registry CRUD operations', async () => {
  const pm = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });
  const testRoot = '/tmp/pm-test-' + Date.now();

  await pm.registerProjectInRegistry(
    testRoot,
    'opencode',
    ['gpt-4', 'claude-sonnet-4'],
    ['nodejs', 'typescript'],
    '/tmp/trail-123',
    'LINEAR-123',
  );

  const registry = await pm.getProjectRegistry(testRoot);
  assert.equal(registry.lastAdapter, 'opencode');
  assert.deepEqual(registry.preferredModels, ['gpt-4', 'claude-sonnet-4']);
  assert.deepEqual(registry.stackSignals, ['nodejs', 'typescript']);
  assert.equal(registry.trailPath, '/tmp/trail-123');
  assert.equal(registry.linkedLinearId, 'LINEAR-123');

  await pm.updateProjectRegistry(
    testRoot,
    'claude',
    ['claude-opus-4'],
    ['python'],
    '/tmp/trail-456',
    'LINEAR-456',
  );

  const updated = await pm.getProjectRegistry(testRoot);
  assert.equal(updated.lastAdapter, 'claude');
  assert.deepEqual(updated.preferredModels, ['claude-opus-4']);
  assert.deepEqual(updated.stackSignals, ['python']);
  assert.equal(updated.trailPath, '/tmp/trail-456');
  assert.equal(updated.linkedLinearId, 'LINEAR-456');
});

test('ProjectManager registry returns empty for unknown project', async () => {
  const pm = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });

  const registry = await pm.getProjectRegistry('/nonexistent/path');
  assert.deepEqual(registry, {});
});

test('ProjectManager registry persists to database', async () => {
  const pm = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });
  const testRoot = '/tmp/pm-db-test-' + Date.now();

  await pm.registerProjectInRegistry(
    testRoot,
    'opencode',
    ['gpt-4'],
    [],
    '',
    'LINEAR-DB',
  );

  const pm2 = new ProjectManager({ log: { info() {}, warn() {}, error() {} } });
  const registry = await pm2.getProjectRegistry(testRoot);

  assert.equal(registry.lastAdapter, 'opencode');
  assert.deepEqual(registry.preferredModels, ['gpt-4']);
  assert.equal(registry.linkedLinearId, 'LINEAR-DB');
});
