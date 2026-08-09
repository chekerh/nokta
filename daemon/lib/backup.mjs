import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getDbPath, getDb } from '../db/connection.mjs';

const MAX_BACKUPS = 7;

function getBackupDir() {
  return path.join(path.dirname(getDbPath()), 'backups');
}

export async function createBackup() {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `nokta-${timestamp}.db`);

  await fs.mkdir(backupDir, { recursive: true });
  const db = getDb();
  db.exec(`VACUUM INTO '${backupPath}'`);

  const files = await fs.readdir(backupDir);
  const dbFiles = files
    .filter((f) => f.startsWith('nokta-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const file of dbFiles.slice(MAX_BACKUPS)) {
    await fs.unlink(path.join(backupDir, file)).catch((err) => {
      console.warn(`[backup] Failed to delete old backup ${file}: ${err.message}`);
    });
  }

  const stat = await fs.stat(backupPath);
  return { path: backupPath, size: stat.size };
}

export async function listBackups() {
  const backupDir = getBackupDir();
  try {
    const files = await fs.readdir(backupDir);
    const dbFiles = files
      .filter((f) => f.startsWith('nokta-') && f.endsWith('.db'))
      .sort()
      .reverse();
    const backups = [];
    for (const file of dbFiles) {
      const stat = await fs.stat(path.join(backupDir, file));
      backups.push({ name: file, path: path.join(backupDir, file), size: stat.size, created: stat.mtime });
    }
    return backups;
  } catch {
    return [];
  }
}

export function startAutoBackup() {
  setInterval(
    async () => {
      try {
        await createBackup();
      } catch (err) {
        console.error('[backup] Auto-backup failed:', err.message);
      }
    },
    24 * 60 * 60 * 1000,
  ).unref();
}
