import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { bearerToken, requestToken } from '../daemon/lib/auth.mjs';
import { resolveSafeTarget, parsePagination, paginationMeta } from '../daemon/lib/route-utils.mjs';

// resolveSafeTarget is the single path-traversal guard shared by the trail and mcp
// routes. It used to compare raw string prefixes, which let a sibling directory
// whose name merely starts with the project name through.
test('resolveSafeTarget allows paths inside the project root', () => {
  const root = path.resolve(process.cwd());
  assert.equal(resolveSafeTarget('.'), root);
  assert.equal(resolveSafeTarget('daemon/lib'), path.join(root, 'daemon/lib'));
  // A path that round-trips back inside the root is fine.
  assert.equal(resolveSafeTarget('daemon/../daemon/lib'), path.join(root, 'daemon/lib'));
});

test('resolveSafeTarget blocks traversal out of the project root', () => {
  for (const target of ['../etc', '/etc/passwd', '../../..', '/']) {
    assert.throws(() => resolveSafeTarget(target), /Path traversal/, `expected ${target} to be blocked`);
  }
});

test('resolveSafeTarget blocks a sibling directory sharing the root prefix', () => {
  const parent = path.dirname(path.resolve(process.cwd()));
  const siblingName = path.basename(path.resolve(process.cwd())) + '-evil';
  assert.throws(() => resolveSafeTarget(path.join(parent, siblingName)), /Path traversal/);
});

// RFC 7235 makes the auth scheme case-insensitive; authMiddleware and the static
// API-key gate in server.mjs disagreed on this before they shared one helper.
test('bearerToken extracts the token regardless of scheme casing', () => {
  for (const header of ['Bearer abc123', 'bearer abc123', 'BEARER  abc123', 'BeArEr abc123']) {
    assert.equal(bearerToken({ headers: { authorization: header } }), 'abc123');
  }
});

test('bearerToken returns null when absent or not a bearer header', () => {
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc123' } }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Bearer ' } }), null);
  assert.equal(bearerToken({}), null);
});

test('requestToken prefers the header and falls back to a query token', () => {
  assert.equal(requestToken({ headers: { authorization: 'Bearer qpx' } }), 'qpx');
  assert.equal(requestToken({ headers: {}, query: { token: 'qry' } }), 'qry');
  assert.equal(
    requestToken({ headers: { authorization: 'Bearer hdr' }, query: { token: 'qry' } }),
    'hdr',
  );
  assert.equal(requestToken({ headers: {}, query: { token: ['a', 'b'] } }), null);
  assert.equal(requestToken({ headers: {}, query: { token: '' } }), null);
  assert.equal(requestToken({ headers: {} }), null);
});

test('parsePagination only engages when page is present', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, enabled: false });
  assert.deepEqual(parsePagination({ limit: '5' }), { page: 1, limit: 5, enabled: false });
});

test('parsePagination clamps page and limit', () => {
  assert.deepEqual(parsePagination({ page: '2', limit: '10' }), { page: 2, limit: 10, enabled: true });
  assert.deepEqual(parsePagination({ page: '0', limit: '0' }), { page: 1, limit: 20, enabled: true });
  assert.deepEqual(parsePagination({ page: '999', limit: '100000' }), {
    page: 999,
    limit: 100,
    enabled: true,
  });
  assert.deepEqual(parsePagination({ page: 'abc', limit: 'xyz' }), { page: 1, limit: 20, enabled: true });
});

test('paginationMeta reports totalPages of at least one', () => {
  assert.deepEqual(paginationMeta(0, { page: 1, limit: 20 }), { page: 1, limit: 20, total: 0, totalPages: 1 });
  assert.deepEqual(paginationMeta(25, { page: 2, limit: 10 }), { page: 2, limit: 10, total: 25, totalPages: 3 });
});
