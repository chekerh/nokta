import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NOKTA_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-ttl-bad-test-'));
// A non-numeric TTL must fall back to the 900s default rather than producing
// NaN, which would sign tokens with a null `exp` (i.e. never expiring).
process.env.NOKTA_ACCESS_TOKEN_TTL_SEC = 'not-a-number';

const { createToken } = await import('../daemon/lib/auth.mjs');

test('a non-numeric access-token TTL falls back to the 900s default', () => {
  const payload = JSON.parse(Buffer.from(createToken({ sub: 'usr_ttl' }).split('.')[1], 'base64url').toString());
  assert.equal(payload.exp - payload.iat, 900);
});
