import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import express from 'express';
import {
  normalizeRequestId,
  requestIdMiddleware,
  runWithRequestId,
  currentRequestId,
  correlationHeaders,
} from '../daemon/lib/request-id.mjs';
import { OpenAIProvider } from '../daemon/providers/openai.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((r) => server.close(r));
}

async function startExpress(build) {
  const app = express();
  build(app);
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('normalizeRequestId accepts safe ids and rejects junk', () => {
  assert.equal(normalizeRequestId('abc-123_XY.z'), 'abc-123_XY.z');
  assert.match(normalizeRequestId('bad\nid'), UUID, 'newline injection is rejected');
  assert.match(normalizeRequestId('a'.repeat(300)), UUID, 'oversized ids are rejected');
  assert.match(normalizeRequestId(undefined), UUID);
  assert.match(normalizeRequestId(42), UUID);
});

test('middleware echoes an incoming id and generates one otherwise', async () => {
  const { server, base } = await startExpress((app) => {
    app.use(requestIdMiddleware);
    app.get('/who', async (req, res) => {
      await new Promise((r) => setTimeout(r, 1));
      res.json({ id: req.id, ctx: currentRequestId() });
    });
  });
  try {
    const withHeader = await fetch(`${base}/who`, { headers: { 'X-Request-Id': 'client-abc-123' } });
    assert.equal(withHeader.headers.get('x-request-id'), 'client-abc-123');
    assert.deepEqual(await withHeader.json(), { id: 'client-abc-123', ctx: 'client-abc-123' });

    const without = await fetch(`${base}/who`);
    const body = await without.json();
    assert.match(body.id, UUID);
    assert.equal(without.headers.get('x-request-id'), body.id);
    assert.equal(body.ctx, body.id, 'the id is available via AsyncLocalStorage inside the handler');
  } finally {
    await close(server);
  }
});

test('the correlation context is empty outside a request', () => {
  assert.equal(currentRequestId(), undefined);
  assert.deepEqual(correlationHeaders(), {});
  assert.deepEqual(correlationHeaders({ Accept: 'application/json' }), { Accept: 'application/json' });
});

test('runWithRequestId scopes the id and survives awaits', async () => {
  await runWithRequestId('rid-1', async () => {
    assert.equal(currentRequestId(), 'rid-1');
    assert.deepEqual(correlationHeaders(), { 'X-Request-Id': 'rid-1' });
    assert.deepEqual(correlationHeaders({ Accept: 'x' }), { 'X-Request-Id': 'rid-1', Accept: 'x' });
    assert.equal(correlationHeaders({ 'X-Request-Id': 'override' })['X-Request-Id'], 'override');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(currentRequestId(), 'rid-1');
  });
  assert.equal(currentRequestId(), undefined, 'context does not leak after the run');
});

test('provider service calls carry the correlation id; unbound calls do not', async () => {
  let seen = 'unset';
  const { server, port } = await listen((req, res) => {
    seen = req.headers['x-request-id'];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }] }));
  });
  try {
    const provider = new OpenAIProvider({ apiKey: 'test', baseUrl: `http://127.0.0.1:${port}` });
    const models = await runWithRequestId('trace-42', () => provider.listModels());
    assert.deepEqual(models, ['gpt-4o']);
    assert.equal(seen, 'trace-42');

    seen = undefined;
    await provider.listModels();
    assert.equal(seen, undefined, 'no X-Request-Id header when there is no request context');
  } finally {
    await close(server);
  }
});

test('log lines carry the request id inside a request context', async () => {
  const { logger, setLogLevel } = await import('../daemon/lib/logger.mjs');
  setLogLevel('debug');
  const captured = [];
  const originalWrite = process.stderr.write;
  const prevFormat = process.env.NOKTA_LOG_FORMAT;
  try {
    process.env.NOKTA_LOG_FORMAT = 'json';
    process.stderr.write = (chunk) => {
      captured.push(String(chunk));
      return true;
    };
    logger.info('outside-request');
    await runWithRequestId('req-xyz', async () => logger.info('inside-request', { userId: 7 }));

    delete process.env.NOKTA_LOG_FORMAT;
    logger.info('plain-inside');
    await runWithRequestId('req-abc', async () => logger.info('plain-context'));
  } finally {
    process.stderr.write = originalWrite;
    if (prevFormat === undefined) delete process.env.NOKTA_LOG_FORMAT;
    else process.env.NOKTA_LOG_FORMAT = prevFormat;
  }

  const outside = JSON.parse(captured.find((l) => l.includes('outside-request')));
  const inside = JSON.parse(captured.find((l) => l.includes('inside-request')));
  assert.equal(outside.requestId, undefined);
  assert.equal(inside.requestId, 'req-xyz');
  assert.equal(inside.userId, 7);

  const plain = captured.find((l) => l.includes('plain-context'));
  assert.match(plain, /\(req-abc\)/);
  const plainOutside = captured.find((l) => l.includes('plain-inside'));
  assert.doesNotMatch(plainOutside, /\(req-/);
});
