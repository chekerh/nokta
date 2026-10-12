import { prepare, transaction } from '../db/connection.mjs';
import { makeId, generateResetToken, hashToken } from './auth.mjs';

// Long-lived, DB-backed refresh tokens. Only the SHA-256 hash is stored, so a
// leaked row cannot be replayed. Each use rotates the token (the old one is
// revoked), which means a stolen refresh token is usable at most once before
// the legitimate client's next refresh invalidates it.
//
// A non-numeric or non-positive TTL falls back to the default rather than
// producing NaN (which would make a token that never expires).
function positiveInt(raw, fallback) {
  const value = parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const REFRESH_TTL_SEC = positiveInt(process.env.NOKTA_REFRESH_TOKEN_TTL_SEC, 604800); // 7 days
// Absolute ceiling for a rotating family. Rotation extends expires_at, but a
// session can never outlive this window even if refreshed continuously.
const REFRESH_MAX_SEC = positiveInt(process.env.NOKTA_REFRESH_MAX_SEC, 2592000); // 30 days
// A token revoked less than this long ago is assumed to be a benign race (two
// tabs refreshing at once) rather than theft, so the family is not torn down.
const REUSE_GRACE_MS = 60 * 1000;

function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function insertToken(userId, familyExpiresAt) {
  const token = generateResetToken();
  prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, family_expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(makeId('rt_'), userId, hashToken(token), isoFromNow(REFRESH_TTL_SEC), familyExpiresAt);
  return token;
}

function usable(row, now) {
  if (!row || row.revoked_at) return false;
  if (new Date(row.expires_at).getTime() < now) return false;
  if (row.family_expires_at && new Date(row.family_expires_at).getTime() < now) return false;
  return true;
}

export function issueRefreshToken(userId) {
  return insertToken(userId, isoFromNow(REFRESH_MAX_SEC));
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
//
// The old row is revoked with a *conditional* UPDATE so two concurrent refreshes
// cannot both succeed. Presenting an already-revoked token is treated as a reuse
// signal: the whole family is revoked, since the token was either stolen or
// captured from a client that raced ahead.
export function rotateRefreshToken(token) {
  const hash = hashToken(token);
  const next = generateResetToken();
  const now = Date.now();
  return transaction(() => {
    const row = prepare(
      'SELECT id, user_id, expires_at, family_expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?',
    ).get(hash);
    if (!row) return null;
    if (row.revoked_at) {
      // Replaying a consumed token is normally a theft signal. Tolerate a token
      // revoked within the grace window, since that is the expected outcome of
      // two concurrent refreshes; otherwise burn the whole family.
      const revokedAt = new Date(String(row.revoked_at).replace(' ', 'T') + 'Z').getTime();
      if (!Number.isFinite(revokedAt) || now - revokedAt > REUSE_GRACE_MS) {
        revokeUserRefreshTokens(row.user_id);
      }
      return null;
    }
    if (!usable(row, now)) return null;

    const claimed = prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
    ).run(row.id);
    if (claimed.changes !== 1) return null;

    prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, family_expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(makeId('rt_'), row.user_id, hashToken(next), isoFromNow(REFRESH_TTL_SEC), row.family_expires_at);
    return { userId: row.user_id, token: next };
  });
}

// Drop refresh tokens that expired over a day ago. Revoked rows are kept until
// their expiry so reuse can still be detected within the token's lifetime.
export function cleanupRefreshTokens() {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const rows = prepare('SELECT id, expires_at FROM refresh_tokens').all();
    const del = prepare('DELETE FROM refresh_tokens WHERE id = ?');
    for (const row of rows) {
      if (new Date(row.expires_at).getTime() < cutoff) del.run(row.id);
    }
  } catch {}
}

export function startRefreshTokenCleanup() {
  cleanupRefreshTokens();
  setInterval(cleanupRefreshTokens, 60 * 60 * 1000).unref();
}
