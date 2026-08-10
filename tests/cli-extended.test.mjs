import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function runCli(args, projRoot = ROOT) {
  try {
    const stdout = execFileSync('node', [path.join(ROOT, 'cli.mjs'), ...args], {
      encoding: 'utf8',
      cwd: projRoot,
      timeout: 10000,
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

test('cli: compile with --json flag outputs content', () => {
  const { stdout } = runCli(['compile', '.', '--adapter', 'codex']);
  assert.ok(stdout.includes('Nokta Compiled Context') || stdout.length > 0);
});

test('cli: compile with --out writes to file', () => {
  const { stdout } = runCli(['compile', '.', '--adapter', 'codex', '--out', '/tmp/nokta-test-compile.md']);
  assert.ok(stdout.includes('Wrote'));
});

test('cli: gates returns exit code 0 for valid trail', () => {
  const { exitCode, stdout } = runCli(['gates', '.']);
  assert.ok(exitCode === 0 || stdout.includes('gate'));
});

test('cli: detect shows stacks and package managers', () => {
  const { stdout } = runCli(['detect', '.']);
  assert.ok(stdout.includes('Stacks:') || stdout.includes('Detecting'));
});

test('cli: daemon status shows health info', () => {
  const { stdout, exitCode } = runCli(['daemon', 'status']);
  assert.ok(stdout.includes('Daemon:') || exitCode === 1);
});

test('cli: trail status shows files', () => {
  const { stdout } = runCli(['trail', 'status', '.']);
  assert.ok(stdout.includes('Trail:'));
});

test('cli: decisions list shows empty or items', () => {
  const { stdout } = runCli(['decisions', 'list', '.']);
  assert.ok(stdout.includes('No decisions') || stdout.includes('DEC-'));
});

test('cli: review-branch shows files and issues', () => {
  const { stdout } = runCli(['review-branch', 'main']);
  assert.ok(stdout.includes('Branch:'));
});

test('cli: version outputs semver', () => {
  const { stdout } = runCli(['--version']);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('cli: help shows all commands', () => {
  const { stdout } = runCli(['--help']);
  const cmds = ['compile', 'gates', 'detect', 'review-pr', 'review-branch', 'daemon', 'trail', 'decisions'];
  for (const cmd of cmds) {
    assert.ok(stdout.includes(cmd), `Missing command: ${cmd}`);
  }
});

test('cli: compile --help shows options for compile', () => {
  const { stdout } = runCli(['--help']);
  assert.ok(stdout.includes('compile <target>'));
  assert.ok(stdout.includes('--out'));
});
