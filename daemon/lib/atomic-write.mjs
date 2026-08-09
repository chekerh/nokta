import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export async function atomicWrite(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fs.writeFile(
      tmpPath,
      typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      options.encoding || 'utf8',
    );
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw err;
  }
}
