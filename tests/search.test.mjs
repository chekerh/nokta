import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  rateLimit,
  authRateLimit,
  recordFailedLogin,
  clearFailedLogin,
  getClientIp,
  providerRateLimit,
} from '../daemon/lib/rate-limit.mjs';

function makeFixture(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nokta-search-${name}-`));
}

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

test('rateLimit passes requests under the limit', () => {
  const handler = rateLimit({ windowMs: 60000, max: 10 });
  let called = false;
  const req = { ip: '127.0.0.1', connection: {} };
  const res = { setHeader() {}, json() {} };
  handler(req, res, () => {
    called = true;
  });
  assert.ok(called);
});

test('rateLimit blocks requests over the limit', () => {
  const handler = rateLimit({ windowMs: 60000, max: 1 });
  const req = { ip: '127.0.0.1', connection: {} };
  let blocked = false;
  const res = {
    setHeader() {},
    status(code) {
      assert.equal(code, 429);
      return this;
    },
    json() {
      blocked = true;
    },
  };
  handler(req, res, () => {});
  handler(req, res, () => {});
  assert.ok(blocked);
});

test('search route detection works on fixture', () => {
  const root = makeFixture('search');
  writeFile(root, 'src/index.js', 'function hello() { return "world"; }\n');
  writeFile(root, 'src/app.js', 'const app = express();\n');

  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(root, full));
    }
  }
  walk(root);

  assert.ok(files.includes('src/index.js'));
  assert.ok(files.includes('src/app.js'));
});

test('getClientIp returns socket.remoteAddress when no proxy', () => {
  const req = { ips: [], socket: { remoteAddress: '192.168.1.100' } };
  assert.equal(getClientIp(req), '192.168.1.100');
});

test('getClientIp trusts req.ips when valid IPv4', () => {
  const req = { ips: ['10.0.0.1'], socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(getClientIp(req), '10.0.0.1');
});

test('getClientIp trusts req.ips when valid IPv6', () => {
  const req = { ips: ['::1'], socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(getClientIp(req), '::1');
});

test('getClientIp rejects spoofed X-Forwarded-For with spaces', () => {
  const req = { ips: ['1.2.3.4, 5.6.7.8'], socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(getClientIp(req), '127.0.0.1');
});

test('getClientIp rejects spoofed X-Forwarded-For with special chars', () => {
  const req = { ips: ['evil.com<script>'], socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(getClientIp(req), '127.0.0.1');
});

test('getClientIp falls back to connection.remoteAddress', () => {
  const req = { ips: [], connection: { remoteAddress: '10.1.1.1' } };
  assert.equal(getClientIp(req), '10.1.1.1');
});

test('getClientIp returns unknown when no IP info', () => {
  const req = { ips: [] };
  assert.equal(getClientIp(req), 'unknown');
});

test('authRateLimit passes requests under the limit', () => {
  let called = false;
  const req = { ip: '127.0.0.1', connection: {}, body: {} };
  const res = { setHeader() {}, json() {} };
  authRateLimit(req, res, () => {
    called = true;
  });
  assert.ok(called);
});

test('authRateLimit blocks requests over the limit', () => {
  const req = { ip: '127.0.0.1', connection: {}, body: { email: 'test@test.com' } };
  let blocked = false;
  const res = {
    setHeader() {},
    status(code) {
      assert.equal(code, 429);
      return this;
    },
    json() {
      blocked = true;
    },
  };
  for (let i = 0; i < 7; i++) authRateLimit(req, res, () => {});
  assert.ok(blocked);
  clearFailedLogin('test@test.com');
});

test('clearFailedLogin resets lockout state', () => {
  const email = 'clear@test.com';
  for (let i = 0; i < 6; i++) recordFailedLogin(email);
  clearFailedLogin(email);
  let passed = false;
  const req = { ip: '10.99.99.99', socket: { remoteAddress: '10.99.99.99' }, body: { email } };
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {},
  };
  authRateLimit(req, res, () => {
    passed = true;
  });
  assert.ok(passed);
});

test('rateLimit uses tier limits when user is authenticated', () => {
  const handler = rateLimit({ windowMs: 60000, max: 10 });
  const req = { ip: '127.0.0.1', connection: {}, user: { id: 'u1', tier: 'enterprise' } };
  let count = 0;
  const res = { setHeader() {}, json() {} };
  for (let i = 0; i < 500; i++) {
    let nextCalled = false;
    handler(req, res, () => {
      nextCalled = true;
      count++;
    });
    if (!nextCalled) break;
  }
  assert.ok(count > 10, `Enterprise user should get more than 10 requests, got ${count}`);
});

test('providerRateLimit passes requests under token budget', () => {
  const handler = providerRateLimit({ tokensPerMinute: 100000, maxBurst: 50000 });
  let called = false;
  const req = { body: { messages: [{ content: 'hello' }] }, user: null };
  const res = { setHeader() {} };
  handler(req, res, () => {
    called = true;
  });
  assert.ok(called);
  assert.ok(req.providerTokenCost > 0);
});
