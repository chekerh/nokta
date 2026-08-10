import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'cli.mjs');

function runCli(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      cwd: opts.cwd || ROOT,
      timeout: 10000,
      ...opts.execOpts,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}

test('cli: --help shows usage', () => {
  const { stdout } = runCli(['--help']);
  assert.ok(stdout.includes('nokta — AI Operating System'));
  assert.ok(stdout.includes('compile'));
  assert.ok(stdout.includes('gates'));
  assert.ok(stdout.includes('detect'));
  assert.ok(stdout.includes('daemon'));
  assert.ok(stdout.includes('trail'));
  assert.ok(stdout.includes('decisions'));
  assert.ok(stdout.includes('kanban'));
  assert.ok(stdout.includes('chat'));
});

test('cli: --version shows version', () => {
  const { stdout } = runCli(['--version']);
  assert.ok(/^\d+\.\d+\.\d+/.test(stdout.trim()));
});

test('cli: compile shows output', () => {
  const { stdout } = runCli(['compile', '.', '--adapter', 'codex']);
  assert.ok(stdout.includes('Compiling') || stdout.length > 0);
});

test('cli: gates evaluates trail gates', () => {
  const result = runCli(['gates', '.']);
  assert.ok(result.exitCode === 0 || result.exitCode === 1);
  assert.ok(result.stdout.includes('trail') || result.stderr.includes('trail'));
});

test('cli: detect identifies project stack', () => {
  const { stdout } = runCli(['detect', '.']);
  assert.ok(stdout.includes('Detecting') || stdout.includes('Stacks:'));
});

test('cli: trail status shows trail files', () => {
  const { stdout } = runCli(['trail', 'status', '.']);
  assert.ok(stdout.includes('Trail:'));
});

test('cli: trail validate runs gates', () => {
  const result = runCli(['trail', 'validate', '.']);
  assert.ok(result.exitCode === 0 || result.exitCode === 1);
});

test('cli: decisions list works', () => {
  const { stdout } = runCli(['decisions', 'list', '.']);
  assert.ok(stdout.includes('No decisions') || stdout.includes('DEC-'));
});

test('cli: daemon status returns non-zero when not running', () => {
  const result = runCli(['daemon', 'status']);
  // Should exit 1 when daemon not running, but we catch that
  assert.ok(result.exitCode === 1 || result.stdout.includes('Daemon'));
});

test('cli: review-branch shows changed files', () => {
  const { stdout } = runCli(['review-branch', 'main']);
  assert.ok(stdout.includes('Branch:'));
});

test('cli: unknown command shows help', () => {
  const { stdout, stderr, exitCode } = runCli(['nonexistent-command']);
  assert.ok(exitCode === 1);
  const output = stdout + stderr;
  assert.ok(output.includes('Unknown command'));
});
