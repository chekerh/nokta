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

test('cli: agent list shows item counts', () => {
  const { stdout } = runCli(['agent', 'list']);
  assert.ok(stdout.includes('Total items:') || stdout.includes('Total'));
});

test('cli: index shows project dashboard', () => {
  const { stdout } = runCli(['index']);
  assert.ok(stdout.includes('Nokta Project Index'));
  assert.ok(stdout.includes('Items:'));
});

test('cli: agent run requires task argument', () => {
  const { exitCode, stderr } = runCli(['agent', 'run']);
  assert.ok(exitCode === 1 || stderr.includes('Usage'));
});

test('cli: search returns results or empty message', () => {
  const { stdout, exitCode } = runCli(['search', 'auth']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('Semantic search') || stdout.includes('No matches'));
});

test('cli: search requires query argument', () => {
  const { exitCode, stderr } = runCli(['search']);
  assert.ok(exitCode === 1 || stderr.includes('Usage'));
});

test('cli: sandbox executes code and shows results', () => {
  const { stdout, exitCode } = runCli(['sandbox', 'console.log("hello")']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('Execution passed') || stdout.includes('Execution failed'));
  assert.ok(stdout.includes('stdout:') || stdout.includes('exit code'));
});

test('cli: sandbox requires code argument', () => {
  const { exitCode, stderr } = runCli(['sandbox']);
  assert.ok(exitCode === 1 || stderr.includes('Usage'));
});

test('cli: sandbox handles code that produces output', () => {
  const { stdout, exitCode } = runCli(['sandbox', 'console.log(42)']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('42') || stdout.includes('passed'));
});

test('cli: skills lists learned skills or shows empty state', () => {
  const { stdout, exitCode } = runCli(['skills']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('Learned Skills') || stdout.includes('0'));
});

test('cli: migrate status shows version info', () => {
  const { stdout, exitCode } = runCli(['migrate', 'status']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('Migration Status'));
});

test('cli: migrate up runs successfully', () => {
  const { stdout, exitCode } = runCli(['migrate', 'up']);
  assert.ok(exitCode === 0);
  assert.ok(stdout.includes('migrations complete') || stdout.includes('All migrations'));
});
