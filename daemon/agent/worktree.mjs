import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_DIR = path.join('.nokta', 'worktrees');

function git(args, cwd, timeout = 60000) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

// git reports resolved paths, and on macOS /tmp is a symlink to /private/tmp, so
// comparing raw strings misclassifies our own worktrees. Normalize both sides.
function realpathOrSelf(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function isInsideWorktreeBase(projectRoot, candidate) {
  const base = realpathOrSelf(worktreeBaseDir(projectRoot));
  const target = realpathOrSelf(candidate);
  return target === base || target.startsWith(base + path.sep);
}

export function isGitRepo(projectRoot) {
  const out = tryGit(['rev-parse', '--is-inside-work-tree'], projectRoot);
  return out === 'true';
}

export function worktreeBaseDir(projectRoot) {
  const configured = process.env.NOKTA_WORKTREE_DIR;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(projectRoot, configured);
  return path.join(projectRoot, DEFAULT_BASE_DIR);
}

/** Branch name for a run. Kept filesystem- and ref-safe. */
export function branchNameForRun(runId) {
  const safe = String(runId)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Run ids already read as "run-…", so prefix with "nokta/" rather than adding
  // a second "run-".
  return `nokta/${safe}`;
}

/**
 * Creates an isolated git worktree so a run can never mutate the tree that is
 * executing it. Returns null when isolation is not possible (not a git repo, or
 * git refused), in which case the caller decides whether to proceed.
 *
 * The worktree branches from HEAD, so it contains committed code only. A dirty
 * working tree is deliberately not carried over: a reproducible base is worth
 * more than seeing uncommitted scratch work, and copying it in would reintroduce
 * the risk this is meant to remove.
 */
export function createRunWorktree({ projectRoot, runId, baseRef = 'HEAD' }) {
  const root = path.resolve(projectRoot);
  if (!isGitRepo(root)) return { ok: false, reason: 'not a git repository' };

  const branch = branchNameForRun(runId);
  const target = path.join(worktreeBaseDir(root), runId);

  if (fs.existsSync(target)) {
    // A leftover worktree from a previous run with the same id: reuse it rather
    // than failing, but never silently discard work.
    const head = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], target);
    if (head) return { ok: true, path: target, branch, reused: true };
    fs.rmSync(target, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });

  // Drop a stale branch of the same name (e.g. from a cleaned-up run) so the
  // add below does not fail on "branch already exists".
  tryGit(['branch', '-D', branch], root);

  try {
    git(['worktree', 'add', '-b', branch, target, baseRef], root);
  } catch (err) {
    return { ok: false, reason: `git worktree add failed: ${(err.stderr || err.message || '').trim()}` };
  }

  return { ok: true, path: target, branch, reused: false };
}

export function removeRunWorktree({ projectRoot, worktreePath, branch }) {
  const root = path.resolve(projectRoot);

  // Refuse to remove anything outside our own worktree directory.
  if (!isInsideWorktreeBase(root, worktreePath)) {
    return { ok: false, reason: 'refusing to remove a path outside the worktree directory' };
  }
  const resolved = realpathOrSelf(worktreePath);

  git(['worktree', 'remove', '--force', resolved], root, 60000);
  if (branch) tryGit(['branch', '-D', branch.replace(/^refs\/heads\//, '')], root);
  fs.rmSync(resolved, { recursive: true, force: true });
  tryGit(['worktree', 'prune'], root);
  return { ok: true };
}

/** Lists worktrees this module created, with their branch and HEAD state. */
export function listRunWorktrees(projectRoot) {
  const root = path.resolve(projectRoot);
  const out = tryGit(['worktree', 'list', '--porcelain'], root);
  if (!out) return [];
  const entries = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim() };
      entries.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line
        .slice('branch '.length)
        .trim()
        .replace(/^refs\/heads\//, '');
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim();
    }
  }
  return entries
    .filter((e) => isInsideWorktreeBase(root, e.path))
    .map((e) => ({
      ...e,
      runId: path.basename(e.path),
      dirty: tryGit(['status', '--porcelain'], e.path) !== '',
    }));
}
