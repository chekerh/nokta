const locks = new Map();
const pending = new Map();

export async function acquireLock(key, timeout = 5000) {
  if (!locks.has(key)) {
    locks.set(key, false);
  }

  if (!locks.get(key)) {
    locks.set(key, true);
    return true;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const list = pending.get(key) || [];
      const idx = list.indexOf(resolve);
      if (idx !== -1) list.splice(idx, 1);
      reject(new Error(`Lock timeout: ${key}`));
    }, timeout);

    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export function releaseLock(key) {
  locks.set(key, false);
  const list = pending.get(key) || [];
  if (list.length > 0) {
    const next = list.shift();
    locks.set(key, true);
    next();
  }
}

// --- Cross-process file locks ------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export async function acquireFileLock(lockPath, timeout = 10000) {
  const dir = path.dirname(lockPath);
  await fs.mkdir(dir, { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      const fh = await fs.open(lockPath, 'wx');
      await fh.writeFile(String(process.pid));
      await fh.close();
      return lockPath;
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err;
      try {
        const st = await fs.stat(lockPath);
        if (Date.now() - st.mtimeMs > 10000) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {}
      if (Date.now() - start >= timeout) {
        throw new Error(`File lock timeout: ${lockPath}`);
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}

export async function releaseFileLock(lockPath) {
  try {
    await fs.unlink(lockPath);
  } catch {}
}

export function lockPathFor(projectRoot) {
  return path.join(projectRoot, '.nokta', 'sprints', '.items.lock');
}
