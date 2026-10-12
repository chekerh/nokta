import * as crypto from 'node:crypto';
import { prepare } from '../db/connection.mjs';
import { blacklistToken, isBlacklisted } from './token-blacklist.mjs';
import { getCurrentKey, getKey } from './jwt-keys.mjs';

// Access tokens are short-lived; a long-lived refresh token (see
// refresh-tokens.mjs) mints new ones. NOKTA_TOKEN_TTL_SEC is still honoured as
// a fallback so existing deployments keep their configured lifetime. A
// non-numeric or non-positive value falls back to the default rather than
// yielding NaN (which would produce tokens with a null `exp`).
function positiveInt(raw, fallback) {
  const value = parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const TOKEN_EXPIRY_SEC = positiveInt(
  process.env.NOKTA_ACCESS_TOKEN_TTL_SEC || process.env.NOKTA_TOKEN_TTL_SEC,
  900,
);

function base64url(buf) {
  return buf.toString('base64url');
}

function hmacSha256(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

export function makeId(prefix = '') {
  return prefix + crypto.randomBytes(16).toString('hex');
}

// Opaque, high-entropy value for one-time links (e.g. password reset). 32 bytes
// of entropy makes the token unguessable; only its hash is ever persisted.
export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Deterministic hash so a leaked database row cannot be replayed as a token.
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

export function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, keyHex] = hash.split(':');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex') === keyHex);
    });
  });
}

export function validatePassword(password) {
  if (!password || password.length < 8) return { valid: false, reason: 'at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'a lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'a number' };
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { valid: false, reason: 'a special character' };
  return { valid: true };
}

export function createToken(payload) {
  const { kid, secret } = getCurrentKey();
  const jti = crypto.randomBytes(16).toString('hex');
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid })));
  const body = base64url(
    Buffer.from(
      JSON.stringify({
        ...payload,
        jti,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SEC,
      }),
    ),
  );
  const signature = base64url(hmacSha256(secret, `${header}.${body}`));
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Prefer the signing key named by the token's `kid`; fall back to the
    // current key for legacy tokens minted before `kid` was added.
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const secret = header.kid ? getKey(header.kid) : getCurrentKey().secret;
    if (!secret) return null;

    const expectedSig = base64url(hmacSha256(secret, `${parts[0]}.${parts[1]}`));
    const sigBuf = Buffer.from(parts[2], 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    // A missing or non-numeric exp is treated as invalid, not as "never expires".
    if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.jti && isBlacklisted(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}

// One place to pull the bearer token off a request. The scheme match is
// case-insensitive per RFC 7235 — `Bearer ` alone rejected `bearer <token>`.
// Anchored so a non-Bearer scheme (`Basic …`) is rejected rather than passed
// through as if its credentials were the token.
export function bearerToken(req) {
  const header = (req.headers?.['authorization'] || '').trim();
  const match = /^Bearer\s+(\S.*)$/i.exec(header);
  return match ? match[1].trim() : null;
}

// Token for transports that cannot set headers (EventSource / SSE). Falls back
// to ?token=<jwt> only when the header is absent, and only accepts a string so
// a repeated query param (?token=a&token=b) is not coerced into an array.
export function requestToken(req) {
  const header = bearerToken(req);
  if (header) return header;
  const query = req.query?.token;
  return typeof query === 'string' && query ? query : null;
}

export function authMiddleware(required = true) {
  return (req, res, next) => {
    const token = bearerToken(req);

    if (!token) {
      if (required) return res.status(401).json({ error: 'Authentication required', status: 401 });
      req.user = null;
      return next();
    }

    const payload = verifyToken(token);
    if (!payload) {
      if (required) return res.status(401).json({ error: 'Invalid or expired token', status: 401 });
      req.user = null;
      return next();
    }

    const user = prepare(
      'SELECT id, email, name, role, tier, token_version FROM users WHERE id = ?',
    ).get(payload.sub);
    if (!user) {
      if (required) return res.status(401).json({ error: 'User not found', status: 401 });
      req.user = null;
      return next();
    }

    // A credential change bumps token_version, which invalidates every access
    // token minted before it — independent of the short TTL.
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      if (required) return res.status(401).json({ error: 'Token no longer valid', status: 401 });
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  };
}

export function blacklistCurrentToken(req) {
  const token = bearerToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload?.jti && Number.isFinite(payload.exp)) {
      blacklistToken(payload.jti, new Date(payload.exp * 1000).toISOString());
    }
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', status: 401 });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Forbidden: requires ${role} role`, status: 403 });
    }
    next();
  };
}
