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

// Pagination from ?page=1&limit=20. Only engages when `page` is present, so
// callers that want the whole list keep their current behaviour. `limit`
// clamps to [1, 100]; `page` is 1-indexed.
export function parsePagination(query = {}) {
  const pageRaw = Number.parseInt(query.page, 10);
  const limitRaw = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  return { page, limit, enabled: query.page !== undefined };
}

export function paginationMeta(total, { page, limit }) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Segment-wise containment test: is `child` inside or equal to `parent`?
// Unlike startsWith(), it does not leak into siblings like /base-evil.
export function isWithin(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
