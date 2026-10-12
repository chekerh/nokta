import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NOKTA_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-ttl-clamp-test-'));
// An absurdly large access TTL must be clamped to 24h, not minted as-is.
process.env.NOKTA_ACCESS_TOKEN_TTL_SEC = '999999999999';

const { createToken } = await import('../daemon/lib/auth.mjs');

test('an absurd access-token TTL is clamped to 24h', () => {
  const payload = JSON.parse(Buffer.from(createToken({ sub: 'usr_ttl' }).split('.')[1], 'base64url').toString());
  assert.equal(payload.exp - payload.iat, 24 * 3600);
});
