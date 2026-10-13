import * as path from 'node:path';
import { statfs } from 'node:fs/promises';
import { getDb, getDbPath } from '../db/connection.mjs';
import { getMigrationStatus } from '../db/schema.mjs';

// Per-dependency health probes backing the /health endpoint. Each returns a
// { status: 'ok' | 'warn' | 'error' | 'skipped', ... } object with detail, so
// load balancers and operators can see exactly which dependency is failing
// instead of a single opaque boolean.

export function checkDatabase() {
  try {
    const { currentVersion, totalMigrations } = getMigrationStatus();
    const db = getDb();
    const row = db.prepare('SELECT sqlite_version() AS v').get();
    return {
      status: 'ok',
      engine: 'sqlite',
      sqlite: row?.v ?? 'unknown',
      schemaVersion: currentVersion,
      totalMigrations,
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

const MIN_FREE_BYTES = 512 * 1024 * 1024; // 512 MB
const MIN_FREE_RATIO = 0.05; // 5%

// Pure decision so the threshold logic is testable without mocking statfs.
export function classifyDisk(totalBytes, availableBytes) {
  if (!(totalBytes > 0)) return 'ok'; // cannot measure; do not alarm
  if (availableBytes < MIN_FREE_BYTES || availableBytes / totalBytes < MIN_FREE_RATIO) return 'warn';
  return 'ok';
}

export async function checkDisk(dataDir = path.dirname(getDbPath())) {
  try {
    const s = await statfs(dataDir);
    const totalBytes = s.blocks * s.bsize;
    const availableBytes = s.bavail * s.bsize;
    const freePercent = totalBytes > 0 ? Math.round((availableBytes / totalBytes) * 100) : 100;
    return {
      status: classifyDisk(totalBytes, availableBytes),
      path: dataDir,
      totalBytes,
      availableBytes,
      freePercent,
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

// Summarize a ProviderManager#health() result. A deployment with no configured
// providers is a valid, healthy state; one with configured-but-failing
// providers is degraded or error. `degraded` and `note` are always present so
// the payload shape is stable for consumers.
export function summarizeProviderHealth(health = {}) {
  const entries = Object.entries(health);
  const enabled = entries.filter(([, r]) => r?.status !== 'skipped');
  if (enabled.length === 0) {
    return {
      status: 'ok',
      total: entries.length,
      healthy: 0,
      degraded: 0,
      note: entries.length > 0 ? 'all providers skipped (disabled)' : 'no providers configured',
    };
  }
  const healthy = enabled.filter(([, r]) => r?.status === 'ok');
  const status = healthy.length === enabled.length ? 'ok' : healthy.length > 0 ? 'degraded' : 'error';
  return {
    status,
    total: entries.length,
    healthy: healthy.length,
    degraded: enabled.length - healthy.length,
    note: status === 'ok' ? null : `${enabled.length - healthy.length} of ${enabled.length} enabled providers failing`,
  };
}

export async function checkAll({ providerManager, providerHealth, dataDir } = {}) {
  const database = checkDatabase();
  const disk = await checkDisk(dataDir);
  let providers = { status: 'skipped' };
  if (providerManager) {
    try {
      if (providerHealth === null) {
        providers = {
          status: 'error',
          total: 0,
          healthy: 0,
          degraded: 0,
          note: 'provider health sweep failed',
        };
      } else {
        providers = summarizeProviderHealth(providerHealth ?? (await providerManager.health()));
      }
    } catch (err) {
      providers = {
        status: 'error',
        total: 0,
        healthy: 0,
        degraded: 0,
        note: 'health sweep failed: ' + err.message,
      };
    }
  }
  const status = [database, disk, providers].every((c) => c.status === 'ok') ? 'ok' : 'degraded';
  return { status, database, disk, providers };
}
