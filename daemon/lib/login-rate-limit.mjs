const attempts = new Map();
const WINDOW_MS = 60000;
const MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }
  record.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

export function resetLoginAttempts(ip) {
  attempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    if (now > record.resetAt) attempts.delete(ip);
  }
}, 300000).unref();
