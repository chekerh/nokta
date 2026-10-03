import { AppError } from '../types.mjs';
import path from 'node:path';

export { AppError };

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Shared silent default for every class that accepts `{ log }`. Errors still
// reach stderr — only debug/info/warn are swallowed.
export const NOOP_LOG = { debug() {}, info() {}, warn() {}, error: console.error };

// Confine a caller-supplied path to the project root. Compares path segments, not
// string prefixes: a plain startsWith() lets a sibling like /repo-evil pass for /repo.
export function resolveSafeTarget(target) {
  const projectRoot = path.resolve(process.cwd());
  const resolved = path.resolve(projectRoot, target || '.');
  const rel = path.relative(projectRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AppError('Path traversal detected in target', 403);
  }
  return resolved;
}
