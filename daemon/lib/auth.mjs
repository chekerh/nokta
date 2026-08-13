import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prepare } from '../db/connection.mjs';
import { blacklistToken, isBlacklisted } from './token-blacklist.mjs';

const TOKEN_EXPIRY_SEC = parseInt(process.env.NOKTA_TOKEN_TTL_SEC || '604800', 10);

function base64url(buf) {
  return buf.toString('base64url');
}

function hmacSha256(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

function getSecret() {
  const secret = process.env.NOKTA_JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NOKTA_JWT_SECRET must be set explicitly in production');
  }
  const dataDir = process.env.NOKTA_DATA_DIR || path.join(process.cwd(), '.nokta');
  const secretPath = path.join(dataDir, '.jwt-secret');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch {
    const key = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, key, { mode: 0o600 });
    return key;
  }
}

export function makeId(prefix = '') {
  return prefix + crypto.randomBytes(16).toString('hex');
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
  const secret = getSecret();
  const jti = crypto.randomBytes(16).toString('hex');
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
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
    if (isBlacklisted(token)) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const secret = getSecret();
    const expectedSig = base64url(hmacSha256(secret, `${parts[0]}.${parts[1]}`));
    const sigBuf = Buffer.from(parts[2], 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authMiddleware(required = true) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

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

    const user = prepare('SELECT id, email, name, role, tier FROM users WHERE id = ?').get(payload.sub);
    if (!user) {
      if (required) return res.status(401).json({ error: 'User not found', status: 401 });
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  };
}

export function blacklistCurrentToken(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const payload = verifyToken(token);
    if (payload?.jti) {
      blacklistToken(payload.jti, new Date(payload.exp * 1000).toISOString());
    }
  }
}
