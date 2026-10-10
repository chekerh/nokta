import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX_DIR = path.join(DIR, '.nokta', 'sandbox');

/* Clean sandbox directory before each test so leftover files don’t affect later ones */
async function cleanupSandbox() {
  try { await fs.rm(SANDBOX_DIR, { recursive: true, force: true }); } catch {}
}

/* Run once before the first test to guarantee the directory exists */
await cleanupSandbox();

/* Per‑test hook: start fresh every time */
test.beforeEach(async () => {
  await cleanupSandbox();
});

test.afterEach(async () => {
  await cleanupSandbox();
});

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

  const pass = await sandbox.exec('process.exit(0)', { fileName: 'pass.mjs', useDocker: false });
  const fail = await sandbox.exec('process.exit(1)', { fileName: 'fail.mjs', useDocker: false });

  assert.equal(pass.passed, true);
  assert.equal(fail.passed, false);

  await sandbox.cleanup();
});
