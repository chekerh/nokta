import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// Correlation context for the in-flight request. AsyncLocalStorage lets logs
// and outbound service calls pick up the id without threading it through every
// function signature.
const storage = new AsyncLocalStorage();

// Honour a caller-supplied id only if it is bounded and made of characters
// that cannot break a header or a log line. Whitespace, control characters and
// the `()[]` used to delimit text log fields are excluded (so a client cannot
// forge a fake log level or close the `(id)` marker), while the common
// real-world shapes — UUIDs, W3C traceparent, base64 trace ids — still pass.
const SAFE_ID = /^[A-Za-z0-9._:/+=@-]{1,200}$/;

export function normalizeRequestId(value) {
  if (typeof value === 'string' && SAFE_ID.test(value)) return value;
  return randomUUID();
}

export function requestIdMiddleware(req, res, next) {
  req.id = normalizeRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.id);
  return runWithRequestId(req.id, next);
}

export function runWithRequestId(requestId, fn) {
  return storage.run({ requestId }, fn);
}

export function currentRequestId() {
  return storage.getStore()?.requestId;
}

// Headers for an outbound service call. Carries the correlation id when a
// request is in flight; an explicitly supplied X-Request-Id (any case) wins,
// and we never emit a second, differently-cased copy of the header.
export function correlationHeaders(extra = {}) {
  const requestId = currentRequestId();
  const hasId = Object.keys(extra).some((key) => key.toLowerCase() === 'x-request-id');
  if (!requestId || hasId) return { ...extra };
  return { ...extra, 'X-Request-Id': requestId };
}
