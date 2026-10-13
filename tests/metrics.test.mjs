import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-metrics-test-'));
process.env.NOKTA_DATA_DIR = dataDir;

const { createMetrics, metrics, metricsMiddleware, makeMetricsHandler, recordLlmTokens, setGaugeSource } =
  await import('../daemon/lib/metrics.mjs');
const { CostTracker } = await import('../daemon/lib/cost-tracker.mjs');

function startApp(instance) {
  const app = express();
  app.use(metricsMiddleware(instance));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  app.get('/boom', (req, res) => res.status(500).json({ error: 'nope' }));
  app.get('/metrics', makeMetricsHandler(instance));
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.on('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('counter, histogram and gauge render in Prometheus text format', async () => {
  const m = createMetrics();
  m.httpRequestsTotal.inc({ method: 'GET', route: '/x', status_code: '200' });
  m.httpRequestsTotal.inc({ method: 'GET', route: '/x', status_code: '200' });
  m.httpErrorsTotal.inc({ method: 'GET', route: '/x', status_code: '500' });
  m.httpRequestDurationSeconds.observe({ method: 'GET', route: '/x', status_code: '200' }, 0.012);
  m.llmTokensTotal.inc({ provider: 'openai', direction: 'input' }, 100);

  const text = await m.registry.metrics();
  assert.match(text, /^# TYPE nokta_http_requests_total counter$/m);
  assert.match(text, /nokta_http_requests_total\{method="GET",route="\/x",status_code="200"\} 2/);
  assert.match(text, /nokta_http_errors_total\{method="GET",route="\/x",status_code="500"\} 1/);
  assert.match(text, /nokta_http_request_duration_seconds_count\{method="GET",route="\/x",status_code="200"\} 1/);
  assert.match(text, /nokta_http_request_duration_seconds_bucket\{[^}]*le="\+Inf"[^}]*\} 1/);
  assert.match(text, /nokta_llm_tokens_total\{provider="openai",direction="input"\} 100/);
  assert.ok(m.registry.contentType.startsWith('text/plain'));
});

test('gauges read the live source at scrape time', async () => {
  const m = createMetrics({ source: () => ({ activeRuns: 5, queueLength: 3 }) });
  const text = await m.registry.metrics();
  assert.match(text, /^nokta_active_runs 5$/m);
  assert.match(text, /^nokta_queue_length 3$/m);
});

test('middleware records requests, errors, and route patterns (never raw paths)', async () => {
  const m = createMetrics();
  const { server, base } = await startApp(m);
  try {
    await fetch(`${base}/ping?query=1`);
    await fetch(`${base}/boom`);
    await fetch(`${base}/does-not-exist`);
    const text = await (await fetch(`${base}/metrics`)).text();

    // Route labelled by the pattern, not the raw query-bearing path.
    assert.match(text, /nokta_http_requests_total\{method="GET",route="\/ping",status_code="200"\} 1/);
    assert.match(text, /nokta_http_errors_total\{method="GET",route="\/boom",status_code="500"\} 1/);
    assert.match(text, /nokta_http_requests_total\{method="GET",route="\(unmatched\)",status_code="404"\} 1/);
    // A successful request is not counted as an error.
    assert.doesNotMatch(text, /nokta_http_errors_total\{[^}]*route="\/ping"[^}]*\}/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('the /metrics endpoint serves the registry content type', async () => {
  const m = createMetrics();
  const { server, base } = await startApp(m);
  try {
    const res = await fetch(`${base}/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/plain/);
    assert.match(await res.text(), /nokta_http_requests_total/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('recordLlmTokens feeds the singleton counter and ignores bad input', async () => {
  metrics.registry.resetMetrics();
  recordLlmTokens('anthropic', 'output', 250);
  recordLlmTokens('anthropic', 'input', 0); // ignored
  recordLlmTokens('anthropic', 'input', 'nope'); // ignored
  const text = await metrics.registry.metrics();
  assert.match(text, /nokta_llm_tokens_total\{provider="anthropic",direction="output"\} 250/);
  assert.doesNotMatch(text, /direction="input"/);
});

test('setGaugeSource rewires the singleton gauges', async () => {
  metrics.registry.resetMetrics();
  setGaugeSource(() => ({ activeRuns: 7, queueLength: 1 }));
  const text = await metrics.registry.metrics();
  assert.match(text, /^nokta_active_runs 7$/m);
  assert.match(text, /^nokta_queue_length 1$/m);
  setGaugeSource(null);
});

test('CostTracker reports token usage through the onTokens hook', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-cost-test-'));
  const calls = [];
  const tracker = new CostTracker({
    ledgerPath: path.join(dir, 'ledger.json'),
    onTokens: (provider, tokensIn, tokensOut) => calls.push([provider, tokensIn, tokensOut]),
  });
  try {
    await tracker.record('gpt-4o', 120, 80);
    await tracker.recordWithTrustScore('claude-sonnet-4', 10, 5, 0.9);
    assert.deepEqual(calls, [
      ['openai', 120, 80],
      ['claude', 10, 5],
    ]);
    // The ledger is written where it was told to, not to the home directory.
    await fs.access(path.join(dir, 'ledger.json'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
