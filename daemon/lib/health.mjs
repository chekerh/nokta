import * as path from 'node:path';
import { statfs } from 'node:fs/promises';
import { getDb, getDbPath } from '../db/connection.mjs';

// Per-dependency health probes backing the /health endpoint. Each returns a
// { status: 'ok' | 'warn' | 'error' | 'skipped', ... } object with detail, so
// load balancers and operators can see exactly which dependency is failing
// instead of a single opaque boolean.

export function checkDatabase() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get();
    return { status: 'ok', engine: 'sqlite', schemaVersion: row?.v ?? 0 };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

const MIN_FREE_BYTES = 512 * 1024 * 1024; // 512 MB
const MIN_FREE_PERCENT = 5;

export async function checkDisk(dataDir = path.dirname(getDbPath())) {
  try {
    const s = await statfs(dataDir);
    const totalBytes = s.blocks * s.bsize;
    const availableBytes = s.bavail * s.bsize;
    const freePercent = totalBytes > 0 ? Math.round((availableBytes / totalBytes) * 100) : 100;
    const status = availableBytes < MIN_FREE_BYTES || freePercent < MIN_FREE_PERCENT ? 'warn' : 'ok';
    return { status, path: dataDir, totalBytes, availableBytes, freePercent };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

// Summarize a ProviderManager#health() result. A deployment with no configured
// providers is a valid, healthy state; one with configured-but-failing
// providers is degraded or error.
export function summarizeProviderHealth(health = {}) {
  const entries = Object.entries(health);
  const enabled = entries.filter(([, r]) => r.status !== 'skipped');
  if (enabled.length === 0) {
    return { status: 'ok', total: entries.length, healthy: 0, note: 'no providers configured' };
  }
  const healthy = enabled.filter(([, r]) => r.status === 'ok');
  const status = healthy.length === enabled.length ? 'ok' : healthy.length > 0 ? 'degraded' : 'error';
  return {
    status,
    total: entries.length,
    healthy: healthy.length,
    degraded: enabled.length - healthy.length,
  };
}

export async function checkAll({ providerManager, providerHealth } = {}) {
  const database = checkDatabase();
  const disk = await checkDisk();
  const providers = providerManager
    ? summarizeProviderHealth(providerHealth ?? (await providerManager.health()))
    : { status: 'skipped' };
  const status = [database, disk, providers].every((c) => c.status === 'ok') ? 'ok' : 'degraded';
  return { status, database, disk, providers };
}
