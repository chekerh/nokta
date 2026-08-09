import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadDotenv(projectRoot) {
  const envPath = path.join(projectRoot || process.cwd(), '.env');
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (value.startsWith('\\$')) value = value.slice(1);

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
