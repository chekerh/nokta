import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Application metrics exposed at GET /metrics in Prometheus text format.
//
// createMetrics() builds an isolated registry so tests (and any future embed)
// get a clean instance and repeated imports never collide on metric names. The
// module-level `metrics` singleton is what the server wires up.

const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// A gauge source must never be able to take down the /metrics endpoint.
function safeGauge(source, key) {
  try {
    return source()[key] || 0;
  } catch {
    return 0;
  }
}

export function createMetrics({ source } = {}) {
  const registry = new Registry();
  const gaugeSource = typeof source === 'function' ? source : () => ({});

  const httpRequestDurationSeconds = new Histogram({
    name: 'nokta_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: HTTP_DURATION_BUCKETS,
    registers: [registry],
  });
  const httpRequestsTotal = new Counter({
    name: 'nokta_http_requests_total',
    help: 'Total number of HTTP requests handled',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const httpErrorsTotal = new Counter({
    name: 'nokta_http_errors_total',
    help: 'Total number of HTTP responses with status >= 400',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const activeRuns = new Gauge({
    name: 'nokta_active_runs',
    help: 'Agent runs currently executing in the job queue',
    registers: [registry],
    collect() {
      this.set(safeGauge(gaugeSource, 'activeRuns'));
    },
  });
  const queueLength = new Gauge({
    name: 'nokta_queue_length',
    help: 'Agent jobs waiting to start',
    registers: [registry],
    collect() {
      this.set(safeGauge(gaugeSource, 'queueLength'));
    },
  });
  const llmTokensTotal = new Counter({
    name: 'nokta_llm_tokens_total',
    help: 'LLM tokens consumed, labelled by provider and direction',
    labelNames: ['provider', 'direction'],
    registers: [registry],
  });

  return {
    registry,
    httpRequestDurationSeconds,
    httpRequestsTotal,
    httpErrorsTotal,
    activeRuns,
    queueLength,
    llmTokensTotal,
  };
}

// Live source for the queue gauges. The server supplies it once the job queue
// exists, keeping this module decoupled from the queue/orchestrator.
let gaugeSource = () => ({ activeRuns: 0, queueLength: 0 });

export function setGaugeSource(fn) {
  gaugeSource = typeof fn === 'function' ? fn : () => ({ activeRuns: 0, queueLength: 0 });
}

export const metrics = createMetrics({ source: () => gaugeSource() });

export function metricsMiddleware(instance = metrics) {
  return (req, res, next) => {
    const startNs = process.hrtime.bigint();
    let recorded = false;
    const record = (aborted) => {
      if (recorded) return;
      recorded = true;
      const seconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      // Label by the matched route pattern, never the raw path: raw paths would
      // explode the label cardinality on every /agents/:id request.
      const route = req.route ? `${req.baseUrl || ''}${req.route.path}` : '(unmatched)';
      // A client abort has no meaningful response status; label it distinctly so
      // abandoned requests are visible instead of silently counted as 200s.
      const labels = { method: req.method, route, status_code: aborted ? 'aborted' : String(res.statusCode) };
      instance.httpRequestsTotal.inc(labels);
      // Long-lived SSE streams only "finish" at disconnect (their duration is the
      // whole stream lifetime), and aborts have no duration worth recording;
      // count both but keep them out of the latency histogram.
      const contentType = String(res.getHeader('content-type') || '');
      if (!aborted && !contentType.startsWith('text/event-stream')) {
        instance.httpRequestDurationSeconds.observe(labels, seconds);
      }
      // A client abort is not a server error.
      if (!aborted && res.statusCode >= 400) instance.httpErrorsTotal.inc(labels);
    };
    res.on('finish', () => record(false));
    // Aborted connections never emit 'finish'; count them once on 'close'.
    res.on('close', () => {
      if (!res.writableEnded) record(true);
    });
    next();
  };
}

export function makeMetricsHandler(instance = metrics) {
  return async (req, res) => {
    // Render before setting headers: if a collect() throws, Express' error
    // handler can still send a clean JSON body with the right content type.
    const body = await instance.registry.metrics();
    res.set('Content-Type', instance.registry.contentType);
    res.end(body);
  };
}

export function recordLlmTokens(provider, direction, count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return;
  metrics.llmTokensTotal.inc({ provider: provider || 'unknown', direction }, n);
}
