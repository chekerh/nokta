import assert from 'node:assert/strict';
import test from 'node:test';
import { isSecretLikePath, findSecretLikePaths } from '../daemon/lib/secret-paths.mjs';

test('flags credential-bearing files', () => {
  for (const p of [
    '.env',
    'src/.env',
    '.env.local',
    '.env.production',
    'certs/server.pem',
    'deep/nested/private.key',
    'id_rsa',
    'id_ed25519',
    'credentials',
    'credentials.json',
    'secrets.yaml',
    'secret.yml',
    'app/.npmrc',
    '~/.netrc',
    'keystore.p12',
  ]) {
    assert.ok(isSecretLikePath(p), `should flag: ${p}`);
  }
});

test('does not flag ordinary source files', () => {
  for (const p of [
    'cli.mjs',
    'agents/planner.agent.json',
    'daemon/workspace/skill-index.mjs',
    'package.json',
    'src/keyboard.js',
    'monkey.js',
    'src/env.js',
    'src/credentials.js',
    'docs/keyboard.md',
    'tests/skill-index.test.mjs',
  ]) {
    assert.ok(!isSecretLikePath(p), `should NOT flag: ${p}`);
  }
});

test('allows the conventional env templates', () => {
  for (const p of ['.env.example', '.env.sample', '.env.template', 'config/.env.example']) {
    assert.ok(!isSecretLikePath(p), `template must stay committable: ${p}`);
  }
});

test('findSecretLikePaths reads porcelain status lines', () => {
  const porcelain = [
    ' M daemon/agent/executor.mjs',
    '?? agents/new.agent.json',
    '?? .env',
    'A  certs/server.pem',
    'R  old.key -> config/new.key',
  ].join('\n');

  const found = findSecretLikePaths(porcelain);
  assert.ok(found.includes('.env'));
  assert.ok(found.includes('certs/server.pem'));
  // A rename is judged on its destination, which is what gets staged.
  assert.ok(found.includes('config/new.key'));
  assert.ok(!found.includes('daemon/agent/executor.mjs'));
  assert.ok(!found.includes('agents/new.agent.json'));
});

test('findSecretLikePaths tolerates empty input', () => {
  assert.deepEqual(findSecretLikePaths(''), []);
  assert.deepEqual(findSecretLikePaths(null), []);
  assert.deepEqual(findSecretLikePaths(undefined), []);
});
