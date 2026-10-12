import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NOKTA_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-ttl-test-'));
// Exercise the backward-compatible fallback: no dedicated access TTL, only the
// legacy NOKTA_TOKEN_TTL_SEC. It must be honoured verbatim.
delete process.env.NOKTA_ACCESS_TOKEN_TTL_SEC;
process.env.NOKTA_TOKEN_TTL_SEC = '120';

const { createToken } = await import('../daemon/lib/auth.mjs');

test('NOKTA_TOKEN_TTL_SEC is honoured as the access-token TTL fallback', () => {
  const payload = JSON.parse(Buffer.from(createToken({ sub: 'usr_ttl' }).split('.')[1], 'base64url').toString());
  assert.equal(payload.exp - payload.iat, 120);
});
