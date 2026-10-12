import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-refresh-test-'));
process.env.NOKTA_DATA_DIR = dataDir;
delete process.env.NOKTA_ACCESS_TOKEN_TTL_SEC;
delete process.env.NOKTA_TOKEN_TTL_SEC;

const { closeDb } = await import('../daemon/db/connection.mjs');
const { migrate } = await import('../daemon/db/schema.mjs');
const { registerAuthRoutes } = await import('../daemon/routes/auth.mjs');
const { verifyToken } = await import('../daemon/lib/auth.mjs');
const { setMailTransport, resetMailTransport } = await import('../daemon/lib/mailer.mjs');
const { AppError } = await import('../daemon/lib/route-utils.mjs');

migrate();

function mount(register) {
  const routes = new Map();
  const record =
    (method) =>
    (routePath, ...handlers) =>
      routes.set(`${method} ${routePath}`, handlers);
  const app = {
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    patch: record('PATCH'),
    delete: record('DELETE'),
  };
  register(app);
  return routes;
}

const routes = mount(registerAuthRoutes);

function invoke(chain, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(key, value) {
        this.headers[key] = value;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(res);
        return this;
      },
    };
    let i = 0;
    const step = (err) => {
      if (err) {
        reject(err);
        return;
      }
      if (i >= chain.length) {
        resolve(res);
        return;
      }
      chain[i++](req, res, step);
    };
    step();
  });
}

let ipCounter = 0;
function fakeReq(body, token) {
  ipCounter += 1;
  const req = { body, socket: { remoteAddress: `10.1.0.${ipCounter}` }, headers: {} };
  if (token) req.headers.authorization = `Bearer ${token}`;
  return req;
}

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

const register = routes.get('POST /api/v1/auth/register');
const login = routes.get('POST /api/v1/auth/login');
const refresh = routes.get('POST /api/v1/auth/refresh');
const logout = routes.get('POST /api/v1/auth/logout');
const changePassword = routes.get('POST /api/v1/auth/change-password');

let userSeq = 0;
function credentials() {
  userSeq += 1;
  return { email: `refresh-${userSeq}@example.com`, password: 'Passw0rd!' };
}

async function registeredUser() {
  const creds = credentials();
  const res = await invoke(register, fakeReq(creds));
  assert.equal(res.statusCode, 201);
  return { ...creds, ...res.body };
}

test('registration and login issue a short-lived access token plus a refresh token', async () => {
  const { token, refreshToken } = await registeredUser();
  assert.ok(token);
  assert.ok(refreshToken);

  const payload = decodePayload(token);
  assert.equal(payload.exp - payload.iat, 900, 'access tokens default to 15 minutes');
  assert.equal(verifyToken(token)?.sub, payload.sub);
});

test('refresh rotates the token and mints a new access token', async () => {
  const { refreshToken } = await registeredUser();

  const first = await invoke(refresh, fakeReq({ refreshToken }));
  assert.equal(first.statusCode, 200);
  assert.ok(first.body.token);
  assert.ok(first.body.refreshToken);
  assert.notEqual(first.body.refreshToken, refreshToken);
  assert.equal(verifyToken(first.body.token)?.sub, decodePayload(first.body.token).sub);

  // The presented refresh token is single-use.
  await assert.rejects(
    () => invoke(refresh, fakeReq({ refreshToken })),
    (err) => err instanceof AppError && err.status === 401,
  );

  // The freshly issued one still works.
  const second = await invoke(refresh, fakeReq({ refreshToken: first.body.refreshToken }));
  assert.equal(second.statusCode, 200);
});

test('an unknown refresh token is rejected', async () => {
  await assert.rejects(
    () => invoke(refresh, fakeReq({ refreshToken: 'not-a-real-refresh-value' })),
    (err) => err instanceof AppError && err.status === 401,
  );
});

test('logout revokes the refresh token', async () => {
  const { token, refreshToken } = await registeredUser();

  const out = await invoke(logout, fakeReq({}, token));
  assert.equal(out.statusCode, 200);

  await assert.rejects(
    () => invoke(refresh, fakeReq({ refreshToken })),
    (err) => err instanceof AppError && err.status === 401,
  );
});

test('changing the password revokes existing refresh tokens', async () => {
  const { token, refreshToken, password } = await registeredUser();

  const changed = await invoke(
    changePassword,
    fakeReq({ currentPassword: password, newPassword: 'BrandNew1!' }, token),
  );
  assert.equal(changed.statusCode, 200);

  await assert.rejects(
    () => invoke(refresh, fakeReq({ refreshToken })),
    (err) => err instanceof AppError && err.status === 401,
  );
});

test('a password reset revokes existing refresh tokens', async () => {
  const { email, refreshToken } = await registeredUser();

  const sent = [];
  setMailTransport((message) => sent.push(message));
  const forgot = routes.get('POST /api/v1/auth/forgot-password');
  const reset = routes.get('POST /api/v1/auth/reset-password');
  await invoke(forgot, fakeReq({ email }));
  const resetToken = /token=([a-f0-9]+)/.exec(sent[0].text)[1];
  const done = await invoke(reset, fakeReq({ token: resetToken, password: 'Recovered1!' }));
  assert.equal(done.statusCode, 200);
  resetMailTransport();

  await assert.rejects(
    () => invoke(refresh, fakeReq({ refreshToken })),
    (err) => err instanceof AppError && err.status === 401,
  );
});

test('login issues a fresh refresh token for an existing user', async () => {
  const { email, password } = await registeredUser();
  const res = await invoke(login, fakeReq({ email, password }));
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.refreshToken);
});

after(() => {
  resetMailTransport();
  closeDb();
});
