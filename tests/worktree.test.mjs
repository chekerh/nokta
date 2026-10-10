import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { createRunWorktree, removeRunWorktree, listRunWorktrees, isGitRepo, branchNameForRun, worktreeBaseDir } =
  await import('../daemon/agent/worktree.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 }).trim();
}

/** A disposable git repo with one committed file. */
function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-wt-'));
  t.after(() => {
    git(['worktree', 'prune'], root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  git(['init', '-q', '-b', 'main'], root);
  git(['config', 'user.email', 'test@nokta.local'], root);
  git(['config', 'user.name', 'Nokta Test'], root);
  fs.writeFileSync(path.join(root, 'app.mjs'), 'export const version = 1;\n', 'utf8');
  git(['add', '.'], root);
  git(['commit', '-q', '-m', 'initial'], root);
  return root;
}

test('a worktree is created on its own branch and contains committed code', (t) => {
  const root = makeRepo(t);
  const result = createRunWorktree({ projectRoot: root, runId: 'run-abc' });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.branch, 'nokta/run-abc');
  assert.ok(fs.existsSync(path.join(result.path, 'app.mjs')));
  assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD'], result.path), 'nokta/run-abc');
});

test('a run cannot modify the live tree (the whole point)', (t) => {
  const root = makeRepo(t);
  const liveFile = path.join(root, 'app.mjs');
  const before = fs.readFileSync(liveFile, 'utf8');

  const wt = createRunWorktree({ projectRoot: root, runId: 'run-x' });
  assert.equal(wt.ok, true, wt.reason);

  // Simulate a run overwriting the host's source inside the worktree.
  fs.writeFileSync(path.join(wt.path, 'app.mjs'), 'CLOBBERED\n', 'utf8');

  assert.equal(fs.readFileSync(liveFile, 'utf8'), before, 'live tree must be untouched');
  assert.equal(fs.readFileSync(path.join(wt.path, 'app.mjs'), 'utf8'), 'CLOBBERED\n');
  assert.equal(git(['status', '--porcelain'], wt.path), 'M app.mjs', 'worktree holds the change for review');
});

test('uncommitted changes in the live tree are not carried into the worktree', (t) => {
  const root = makeRepo(t);
  fs.writeFileSync(path.join(root, 'app.mjs'), 'UNCOMMITTED\n', 'utf8');
  const wt = createRunWorktree({ projectRoot: root, runId: 'run-dirty' });
  assert.equal(wt.ok, true, wt.reason);
  assert.equal(
    fs.readFileSync(path.join(wt.path, 'app.mjs'), 'utf8'),
    'export const version = 1;\n',
    'worktree must branch from committed HEAD',
  );
});

test('a non-git directory reports that isolation is unavailable', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-nogit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(isGitRepo(dir), false);
  const result = createRunWorktree({ projectRoot: dir, runId: 'run-nogit' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a git repository/);
});

test('removing a worktree also drops its branch', (t) => {
  const root = makeRepo(t);
  const wt = createRunWorktree({ projectRoot: root, runId: 'run-del' });
  assert.equal(wt.ok, true, wt.reason);
  assert.equal(listRunWorktrees(root).length, 1);

  const removed = removeRunWorktree({ projectRoot: root, worktreePath: wt.path, branch: wt.branch });
  assert.equal(removed.ok, true, removed.reason);
  assert.equal(fs.existsSync(wt.path), false);
  assert.equal(listRunWorktrees(root).length, 0);
  assert.equal(
    execFileSync('git', ['branch', '--list', wt.branch], { cwd: root, encoding: 'utf8' }).trim(),
    '',
    'branch should be deleted',
  );
});

test('removal refuses paths outside the worktree directory', (t) => {
  const root = makeRepo(t);
  const result = removeRunWorktree({ projectRoot: root, worktreePath: root, branch: 'main' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /outside the worktree directory/);
  assert.equal(fs.existsSync(path.join(root, 'app.mjs')), true, 'repo must survive the attempt');
});

test('a repeated run id reuses the existing worktree rather than clobbering it', (t) => {
  const root = makeRepo(t);
  const first = createRunWorktree({ projectRoot: root, runId: 'run-same' });
  fs.writeFileSync(path.join(first.path, 'app.mjs'), 'WORK IN PROGRESS\n', 'utf8');

  const second = createRunWorktree({ projectRoot: root, runId: 'run-same' });
  assert.equal(second.ok, true);
  assert.equal(second.reused, true);
  assert.equal(fs.readFileSync(path.join(second.path, 'app.mjs'), 'utf8'), 'WORK IN PROGRESS\n');
});

test('worktree paths stay inside the configured base directory', (t) => {
  const root = makeRepo(t);
  const base = worktreeBaseDir(root);
  const wt = createRunWorktree({ projectRoot: root, runId: 'run-path' });
  assert.equal(path.resolve(wt.path).startsWith(path.resolve(base) + path.sep), true);
  assert.equal(branchNameForRun('run-a/b c'), 'nokta/run-a-b-c', 'branch names must be ref-safe');
});

test('only nokta worktrees are listed', (t) => {
  const root = makeRepo(t);
  const wt = createRunWorktree({ projectRoot: root, runId: 'run-listed' });
  assert.equal(wt.ok, true, wt.reason);

  let listed = listRunWorktrees(root);
  assert.equal(listed.length, 1, 'the created worktree is listed');
  assert.ok(
    !listed.some((e) => path.resolve(e.path) === path.resolve(root)),
    "the repo's own main worktree must not appear",
  );
  assert.equal(listed[0].runId, 'run-listed');
  assert.equal(listed[0].branch, 'nokta/run-listed');
  assert.equal(listed[0].dirty, false, 'a freshly created worktree is clean');

  fs.writeFileSync(path.join(wt.path, 'app.mjs'), 'CHANGED\n', 'utf8');
  listed = listRunWorktrees(root);
  assert.equal(listed[0].dirty, true, 'the modified app.mjs should be reported as dirty');
});
