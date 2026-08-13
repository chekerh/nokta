import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('SandboxManager executes valid JavaScript', async () => {
  const { SandboxManager } = await import(path.join(DIR, 'daemon', 'lib', 'sandbox.mjs'));
  const sandbox = new SandboxManager({ useDocker: false });

  const result = await sandbox.exec('console.log("hello")', { fileName: 'test-exec.mjs' });

  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('hello'));
  assert.equal(result.timedOut, false);
  assert.ok(result.durationMs > 0);

  await sandbox.cleanup();
});

test('SandboxManager catches runtime errors', async () => {
  const { SandboxManager } = await import(path.join(DIR, 'daemon', 'lib', 'sandbox.mjs'));
  const sandbox = new SandboxManager({ useDocker: false });

  const result = await sandbox.exec('throw new Error("test error")', { fileName: 'test-err.mjs' });

  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 1);

  await sandbox.cleanup();
});

test('SandboxManager handles timeout', async () => {
  const { SandboxManager } = await import(path.join(DIR, 'daemon', 'lib', 'sandbox.mjs'));
  const sandbox = new SandboxManager({ useDocker: false });

  const result = await sandbox.exec('setTimeout(() => { console.log("done"); }, 1000);', {
    fileName: 'test-timeout.mjs',
    timeoutMs: 50,
  });

  assert.equal(result.timedOut, true);

  await sandbox.cleanup();
});

test('SandboxResult has correct passed property', async () => {
  const { SandboxManager } = await import(path.join(DIR, 'daemon', 'lib', 'sandbox.mjs'));
  const sandbox = new SandboxManager({ useDocker: false });

  const pass = await sandbox.exec('process.exit(0)', { fileName: 'pass.mjs' });
  const fail = await sandbox.exec('process.exit(1)', { fileName: 'fail.mjs' });

  assert.equal(pass.passed, true);
  assert.equal(fail.passed, false);

  await sandbox.cleanup();
});
