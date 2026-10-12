import { prepare, transaction } from '../db/connection.mjs';
import { makeId, generateResetToken, hashToken } from './auth.mjs';

// Long-lived, DB-backed refresh tokens. Only the SHA-256 hash is stored, so a
// leaked row cannot be replayed. Each use rotates the token (the old one is
// revoked), which means a stolen refresh token is usable at most once before
// the legitimate client's next refresh invalidates it.
const REFRESH_TTL_SEC = parseInt(process.env.NOKTA_REFRESH_TOKEN_TTL_SEC || '604800', 10);

function expiryFromNow() {
  return new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString();
}

export function issueRefreshToken(userId) {
  const token = generateResetToken();
  prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    makeId('rt_'),
    userId,
    hashToken(token),
    expiryFromNow(),
  );
  return token;
}

// Resolve a usable (not revoked, not expired) refresh token without mutating it.
export function lookupRefreshToken(token) {
  const row = prepare('SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?').get(
    hashToken(token),
  );
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export function revokeRefreshToken(token) {
  prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL").run(
    hashToken(token),
  );
}

// Used by logout and after credential changes: invalidate every live refresh
// token for a user so other sessions cannot mint new access tokens.
export function revokeUserRefreshTokens(userId) {
  prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(
    userId,
  );
}

// Consume a refresh token and mint its replacement atomically. Returns
// { userId, token } or null when the presented token is not usable.
export function rotateRefreshToken(token) {
  const row = lookupRefreshToken(token);
  if (!row) return null;
  const next = generateResetToken();
  transaction(() => {
    prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
    prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
      makeId('rt_'),
      row.user_id,
      hashToken(next),
      expiryFromNow(),
    );
  });
  return { userId: row.user_id, token: next };
}
