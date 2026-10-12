import { z } from 'zod';
import { AppError } from './route-utils.mjs';

export { z };

// Express parses JSON bodies for us, but a missing Content-Type or an empty
// body leaves req.body undefined. Treat both as an empty object so schemas
// that only declare optional fields still succeed.
//
// On success the parsed (and defaulted) body replaces req.body, so downstream
// handlers read normalized values. On failure we raise a 400 with a flat list
// of `{ path, message }` issues so clients can point at the offending field
// instead of parsing a wall of text.
export function validateBody(schema) {
  return function validateBodyMiddleware(req, _res, next) {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join('.') : 'body',
        message: issue.message,
      }));
      next(new AppError('Invalid request body', 400, { issues }));
      return;
    }
    req.body = result.data;
    next();
  };
}
