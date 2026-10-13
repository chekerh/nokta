import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Application metrics exposed at GET /metrics in Prometheus text format.
//
// createMetrics() builds an isolated registry so tests (and any future embed)
// get a clean instance and repeated imports never collide on metric names. The
// module-level `metrics` singleton is what the server wires up.

const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

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
      this.set(gaugeSource().activeRuns || 0);
    },
  });
  const queueLength = new Gauge({
    name: 'nokta_queue_length',
    help: 'Agent jobs waiting to start',
    registers: [registry],
    collect() {
      this.set(gaugeSource().queueLength || 0);
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
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      // Label by the matched route pattern, never the raw path: raw paths would
      // explode the label cardinality on every /agents/:id request.
      const route = req.route ? `${req.baseUrl || ''}${req.route.path}` : '(unmatched)';
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      instance.httpRequestsTotal.inc(labels);
      instance.httpRequestDurationSeconds.observe(labels, seconds);
      if (res.statusCode >= 400) instance.httpErrorsTotal.inc(labels);
    });
    next();
  };
}

export function makeMetricsHandler(instance = metrics) {
  return async (req, res) => {
    res.set('Content-Type', instance.registry.contentType);
    res.end(await instance.registry.metrics());
  };
}

export function recordLlmTokens(provider, direction, count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return;
  metrics.llmTokensTotal.inc({ provider: provider || 'unknown', direction }, n);
}
