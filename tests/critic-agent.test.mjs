import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CriticAgent can critique code', async () => {
  const { CriticAgent } = await import(path.join(DIR, 'daemon', 'lib', 'critic-agent.mjs'));
  const critic = new CriticAgent({ chatHandler: null, log: { debug() {}, info() {}, warn() {}, error() {} } });

  try {
    await critic.critique('const x = 1;', { file: 'test.js' });
    assert.fail('Should have thrown without chat handler');
  } catch (err) {
    assert.ok(err.message.includes('ChatHandler not configured'));
  }
});

test('CriticAgent adversarialReview handles no-provider scenario', async () => {
  const { CriticAgent } = await import(path.join(DIR, 'daemon', 'lib', 'critic-agent.mjs'));
  const critic = new CriticAgent({ chatHandler: null, log: { debug() {}, info() {}, warn() {}, error() {} } });

  try {
    await critic.adversarialReview('const x = 1;', { file: 'test.js' });
    assert.fail('Should have thrown without chat handler');
  } catch (err) {
    assert.ok(err.message.includes('ChatHandler not configured'));
  }
});
