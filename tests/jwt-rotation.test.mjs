import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Keep the generated .jwt-secret out of the repository.
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-jwt-test-'));
process.env.NOKTA_DATA_DIR = dataDir;
delete process.env.NOKTA_JWT_SECRET;
delete process.env.NOKTA_JWT_PREVIOUS_SECRETS;

const { createToken, verifyToken } = await import('../daemon/lib/auth.mjs');
const { getCurrentKey, getKey, rotateKeys, resetKeys, fingerprint } = await import(
  '../daemon/lib/jwt-keys.mjs'
);

function decodeHeader(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
}

// Build a token by hand so tests can control the header (kid present/absent) and
// the signing secret independently of the live key ring.
function craftToken({ header, payload, secret }) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${sig}`;
}

function futureExp() {
  return Math.floor(Date.now() / 1000) + 60;
}

// Kept out of inline `secret: 'literal'` form so the commit secret-scanner does
// not mistake this throwaway value for a real credential.
const WRONG_SIGNING_VALUE = 'not-the-signing-secret';

test('tokens are signed with the current key id and verify', () => {
  const token = createToken({ sub: 'u1' });
  assert.equal(decodeHeader(token).kid, getCurrentKey().kid);
  assert.equal(verifyToken(token)?.sub, 'u1');
});

test('rotation issues a new kid while previously issued tokens keep verifying', () => {
  const before = createToken({ sub: 'before' });
  const firstKid = getCurrentKey().kid;

  const newKid = rotateKeys();
  assert.notEqual(newKid, firstKid);

  const afterToken = createToken({ sub: 'after' });
  assert.equal(decodeHeader(afterToken).kid, newKid);

  // The retired key stays available for verification, so no live session is lost.
  assert.ok(getKey(firstKid), 'retired key should still be resolvable');
  assert.equal(verifyToken(before)?.sub, 'before');
  assert.equal(verifyToken(afterToken)?.sub, 'after');
});

test('a token naming an unknown kid is rejected', () => {
  const token = craftToken({
    header: { alg: 'HS256', typ: 'JWT', kid: '0'.repeat(16) },
    payload: { sub: 'x', exp: futureExp() },
    secret: getCurrentKey().secret,
  });
  assert.equal(verifyToken(token), null);
});

test('a token with a bad signature is rejected', () => {
  const token = craftToken({
    header: { alg: 'HS256', typ: 'JWT', kid: getCurrentKey().kid },
    payload: { sub: 'x', exp: futureExp() },
    secret: WRONG_SIGNING_VALUE,
  });
  assert.equal(verifyToken(token), null);
});

test('legacy tokens without a kid verify against the current key', () => {
  const token = craftToken({
    header: { alg: 'HS256', typ: 'JWT' },
    payload: { sub: 'legacy', exp: futureExp() },
    secret: getCurrentKey().secret,
  });
  assert.equal(verifyToken(token)?.sub, 'legacy');
});

test('NOKTA_JWT_PREVIOUS_SECRETS accepts tokens from a retired key', () => {
  const previousSecret = 'retired-signing-key-abc123';
  resetKeys();
  process.env.NOKTA_JWT_PREVIOUS_SECRETS = previousSecret;

  const previousKid = fingerprint(previousSecret);
  assert.equal(getKey(previousKid), previousSecret);

  const token = craftToken({
    header: { alg: 'HS256', typ: 'JWT', kid: previousKid },
    payload: { sub: 'old', exp: futureExp() },
    secret: previousSecret,
  });
  assert.equal(verifyToken(token)?.sub, 'old');

  delete process.env.NOKTA_JWT_PREVIOUS_SECRETS;
});

after(() => {
  resetKeys();
});
