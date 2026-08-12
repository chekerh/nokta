import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const headerId = req.headers['x-request-id'];
  req.id = headerId && /^[a-f0-9-]{1,128}$/i.test(headerId) ? headerId : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
