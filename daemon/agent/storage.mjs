import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const RUNS_DIR = '.nokta';
const RUNS_FILE = 'agent-runs.json';

let _dirPromise = null;

async function ensureDir(dir) {
  if (!_dirPromise) {
    _dirPromise = fs.mkdir(dir, { recursive: true });
  }
  await _dirPromise;
}

export async function getAllRuns(projectRoot) {
  const dir = path.join(projectRoot, RUNS_DIR);
  await ensureDir(dir);
  const filePath = path.join(dir, RUNS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export async function saveRuns(projectRoot, runs) {
  const dir = path.join(projectRoot, RUNS_DIR);
  await ensureDir(dir);
  const filePath = path.join(dir, RUNS_FILE);
  await fs.writeFile(filePath, JSON.stringify({ runs }, null, 2), 'utf8');
}
