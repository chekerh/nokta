const ipStores = new Map();
const userStores = new Map();
const providerBuckets = new Map();
const failedLoginStores = new Map();
const lockedAccounts = new Map();

const TIER_LIMITS = {
  free: { windowMs: 60000, max: 30 },
  pro: { windowMs: 60000, max: 300 },
  enterprise: { windowMs: 60000, max: 1000 },
};

const DEFAULT_TIER_LIMIT = { windowMs: 60000, max: 100 };

const AUTH_RATE_LIMIT = { windowMs: 60000, max: 5 };
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Get real client IP, avoiding X-Forwarded-For spoofing.
// Only trust X-Forwarded-For when trust proxy is set and the header value
// looks like a valid IPv4/IPv6 address (no suspicious characters).
export function getClientIp(req) {
  if (req.ips && req.ips.length > 0) {
    const forwarded = req.ips[0];
    if (forwarded && /^[a-fA-F0-9:.]+$/.test(forwarded)) return forwarded;
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

export function authRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const email = req.body?.email;

  if (email) {
    const lockKey = `email:${email.toLowerCase()}`;
    const lockout = lockedAccounts.get(lockKey);
    if (lockout && now < lockout.expiresAt) {
      res.setHeader('X-RateLimit-Limit', AUTH_RATE_LIMIT.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(lockout.expiresAt / 1000));
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed login attempts',
        status: 429,
        retryAfterMs: lockout.expiresAt - now,
        reason: 'lockout',
      });
    }
  }

  if (!ipStores.has(ip)) {
    ipStores.set(ip, []);
  }
  const timestamps = ipStores.get(ip).filter((t) => now - t < AUTH_RATE_LIMIT.windowMs);
  timestamps.push(now);
  ipStores.set(ip, timestamps);

  res.setHeader('X-RateLimit-Limit', AUTH_RATE_LIMIT.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, AUTH_RATE_LIMIT.max - timestamps.length));
  res.setHeader('X-RateLimit-Reset', Math.ceil((now + AUTH_RATE_LIMIT.windowMs) / 1000));

  if (timestamps.length > AUTH_RATE_LIMIT.max) {
    return res.status(429).json({
      error: 'Too many authentication attempts, please try again later',
      status: 429,
      retryAfterMs: AUTH_RATE_LIMIT.windowMs,
    });
  }

  next();
}

export function recordFailedLogin(email) {
  if (!email) return;
  const lockKey = `email:${email.toLowerCase()}`;
  const now = Date.now();

  if (!failedLoginStores.has(lockKey)) {
    failedLoginStores.set(lockKey, []);
  }
  const attempts = failedLoginStores.get(lockKey).filter((t) => now - t < LOCKOUT_DURATION_MS);
  attempts.push(now);
  failedLoginStores.set(lockKey, attempts);

  if (attempts.length >= LOCKOUT_THRESHOLD) {
    lockedAccounts.set(lockKey, { attempts: attempts.length, expiresAt: now + LOCKOUT_DURATION_MS });
  }
}

export function clearFailedLogin(email) {
  if (!email) return;
  const lockKey = `email:${email.toLowerCase()}`;
  failedLoginStores.delete(lockKey);
  lockedAccounts.delete(lockKey);
}

export function rateLimit(options = {}) {
  const defaultLimit = DEFAULT_TIER_LIMIT;
  return (req, res, next) => {
    const now = Date.now();

    // Determine limits based on user tier
    let windowMs = options.windowMs || defaultLimit.windowMs;
    let max = options.max || defaultLimit.max;

    if (req.user && req.user.tier) {
      const tierLimit = TIER_LIMITS[req.user.tier];
      if (tierLimit) {
        windowMs = tierLimit.windowMs;
        max = tierLimit.max;
      }
    }

    const isAuth = req.user && req.user.id;
    const key = isAuth ? `user:${req.user.id}` : getClientIp(req);
    const store = isAuth ? userStores : ipStores;

    if (!store.has(key)) {
      store.set(key, []);
    }

    const timestamps = store.get(key).filter((t) => now - t < windowMs);
    timestamps.push(now);
    store.set(key, timestamps);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - timestamps.length));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

    if (timestamps.length > max) {
      return res.status(429).json({
        error: 'Too many requests',
        status: 429,
        retryAfterMs: windowMs,
        tier: isAuth ? req.user.tier : 'anonymous',
      });
    }

    next();
  };
}

export function providerRateLimit({ tokensPerMinute = 90000, maxBurst = 50000 } = {}) {
  return (req, res, next) => {
    const providerId = req.body?.model || req.query?.provider || 'default';
    const now = Date.now();

    // Scale limits based on user tier
    let tpm = tokensPerMinute;
    let burst = maxBurst;
    if (req.user && req.user.tier) {
      const multipliers = { free: 0.3, pro: 1, enterprise: 3 };
      const mult = multipliers[req.user.tier] || 1;
      tpm = Math.round(tokensPerMinute * mult);
      burst = Math.round(maxBurst * mult);
    }

    if (!providerBuckets.has(providerId)) {
      providerBuckets.set(providerId, {
        tokens: burst,
        lastRefill: now,
        maxBurst: burst,
        tokensPerMinute: tpm,
      });
    }

    const bucket = providerBuckets.get(providerId);
    const elapsed = (now - bucket.lastRefill) / 60000;
    bucket.tokens = Math.min(bucket.maxBurst, bucket.tokens + elapsed * bucket.tokensPerMinute);
    bucket.lastRefill = now;

    const estimatedTokens = _estimateRequestTokens(req);
    if (estimatedTokens > bucket.tokens) {
      const retryAfter = Math.ceil(((estimatedTokens - bucket.tokens) / bucket.tokensPerMinute) * 60000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Provider rate limit exceeded', status: 429, retryAfterMs: retryAfter });
    }

    bucket.tokens -= estimatedTokens;
    res.setHeader('X-Provider-Tokens-Remaining', String(Math.round(bucket.tokens)));

    req.providerTokenCost = estimatedTokens;

    next();
  };
}

function _estimateRequestTokens(req) {
  if (req.body?.messages) {
    let total = 0;
    for (const m of req.body.messages) {
      total += (m.content || '').length;
    }
    return Math.ceil(total * 1.3) + (req.body.maxTokens || 4096);
  }
  return 1000;
}

export function getProviderBucketStats(providerId) {
  const bucket = providerBuckets.get(providerId);
  if (!bucket) return null;
  return {
    available: Math.round(bucket.tokens),
    maxBurst: bucket.maxBurst,
    tokensPerMinute: bucket.tokensPerMinute,
    utilization: 1 - bucket.tokens / bucket.maxBurst,
  };
}

export function getAllProviderBucketStats() {
  const stats = {};
  for (const [id, bucket] of providerBuckets) {
    stats[id] = {
      available: Math.round(bucket.tokens),
      maxBurst: bucket.maxBurst,
      tokensPerMinute: bucket.tokensPerMinute,
      utilization: 1 - bucket.tokens / bucket.maxBurst,
    };
  }
  return stats;
}

// Cleanup stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const store of [ipStores, userStores]) {
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((t) => now - t < 120000);
      if (valid.length === 0) store.delete(key);
      else store.set(key, valid);
    }
  }
  for (const [key, expiresAt] of lockedAccounts) {
    if (now >= expiresAt.expiresAt) lockedAccounts.delete(key);
  }
  for (const [key, timestamps] of failedLoginStores) {
    const valid = timestamps.filter((t) => now - t < LOCKOUT_DURATION_MS);
    if (valid.length === 0) failedLoginStores.delete(key);
    else failedLoginStores.set(key, valid);
  }
}, 300000).unref();
