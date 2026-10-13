import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// Correlation context for the in-flight request. AsyncLocalStorage lets logs
// and outbound service calls pick up the id without threading it through every
// function signature.
const storage = new AsyncLocalStorage();

// Honour a caller-supplied id only if it is bounded and printable (no spaces,
// no control characters), so a client cannot inject newlines into log lines or
// smuggle control characters into a header — while still accepting the common
// real-world shapes (UUIDs, W3C traceparent, base64 trace ids).
const SAFE_ID = /^[!-~]{1,200}$/;

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
