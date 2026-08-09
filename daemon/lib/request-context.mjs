import * as crypto from 'node:crypto';

export function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

export function requestLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();
    const reqId = req.id;

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path}`, {
        requestId: reqId,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  };
}

export function errorWithRequestId(err, req, res, next) {
  err.requestId = req.id;
  next(err);
}
