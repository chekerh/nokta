import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// Correlation context for the in-flight request. AsyncLocalStorage lets logs
// and outbound service calls pick up the id without threading it through every
// function signature.
const storage = new AsyncLocalStorage();

// Honour a caller-supplied id only if it is short and printable, so a client
// cannot inject newlines/padding into log lines or bloat the response header.
const SAFE_ID = /^[A-Za-z0-9._-]{1,200}$/;

export function normalizeRequestId(value) {
  if (typeof value === 'string' && SAFE_ID.test(value)) return value;
  return randomUUID();
}

export function requestIdMiddleware(req, res, next) {
  req.id = normalizeRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.id);
  runWithRequestId(req.id, next);
}

export function runWithRequestId(requestId, fn) {
  return storage.run({ requestId }, fn);
}

export function currentRequestId() {
  return storage.getStore()?.requestId;
}

// Headers for an outbound service call. Carries the correlation id when a
// request is in flight; explicit headers win, so callers can override.
export function correlationHeaders(extra = {}) {
  const requestId = currentRequestId();
  return requestId ? { 'X-Request-Id': requestId, ...extra } : { ...extra };
}
