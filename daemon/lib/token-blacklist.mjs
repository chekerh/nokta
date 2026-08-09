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
  if (new Date(expiresAt) < new Date()) {
    blacklist.delete(jti);
    return true;
  }
  return true;
}

export function loadBlacklist() {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT token_id, expires_at FROM token_blacklist WHERE expires_at > datetime('now')")
      .all();
    for (const row of rows) {
      blacklist.set(row.token_id, row.expires_at);
    }
  } catch {}
}

export function startBlacklistCleanup() {
  setInterval(() => {
    const now = new Date().toISOString();
    for (const [jti, expiresAt] of blacklist) {
      if (expiresAt < now) blacklist.delete(jti);
    }
    try {
      const db = getDb();
      db.prepare("DELETE FROM token_blacklist WHERE expires_at < datetime('now')").run();
    } catch {}
  }, 60000).unref();
}
