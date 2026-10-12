import { getDb } from '../db/connection.mjs';

const blacklist = new Map();
const MAX_ENTRIES = 10000;

export function blacklistToken(jti, expiresAt) {
  if (blacklist.size >= MAX_ENTRIES) {
    const firstKey = blacklist.keys().next().value;
    blacklist.delete(firstKey);
  }
  blacklist.set(jti, expiresAt);
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO token_blacklist (token_id, expires_at) VALUES (?, ?)').run(jti, expiresAt);
  } catch {}
}

export function isBlacklisted(jti) {
  if (!jti) return false;
  const expiresAt = blacklist.get(jti);
  if (!expiresAt) return false;
  // An entry past its own expiry no longer needs to be remembered; the token is
  // long gone. Drop it and report "not blacklisted".
  if (new Date(expiresAt).getTime() < Date.now()) {
    blacklist.delete(jti);
    return false;
  }
  return true;
}

export function loadBlacklist() {
  try {
    const db = getDb();
    // expires_at is stored as an ISO-8601 string; compare in JS rather than
    // SQLite, whose datetime() parsing of the fractional/`Z` form is unreliable.
    const rows = db.prepare('SELECT token_id, expires_at FROM token_blacklist').all();
    const now = Date.now();
    for (const row of rows) {
      if (new Date(row.expires_at).getTime() >= now) blacklist.set(row.token_id, row.expires_at);
    }
  } catch {}
}

export function startBlacklistCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [jti, expiresAt] of blacklist) {
      if (new Date(expiresAt).getTime() < now) blacklist.delete(jti);
    }
    try {
      const db = getDb();
      const rows = db.prepare('SELECT token_id, expires_at FROM token_blacklist').all();
      const del = db.prepare('DELETE FROM token_blacklist WHERE token_id = ?');
      for (const row of rows) {
        if (new Date(row.expires_at).getTime() < now) del.run(row.token_id);
      }
    } catch {}
  }, 60000).unref();
}
