import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = { debug: 90, info: 36, warn: 33, error: 31 };
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 5;

let currentLevel = LEVELS[process.env.NOKTA_LOG_LEVEL] ?? LEVELS.info;
let logPath = null;
let logSize = 0;

export function setLogLevel(level) {
  currentLevel = LEVELS[level] ?? LEVELS.info;
}

export function setLogPath(filePath) {
  logPath = filePath;
  logSize = 0;
  const dir = path.dirname(filePath);
  try {
    fsSync.mkdirSync(dir, { recursive: true });
  } catch {}
}

async function rotateLog() {
  if (!logPath) return;
  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const oldPath = logPath + '.' + i;
    const newPath = logPath + '.' + (i + 1);
    try {
      await fs.rename(oldPath, newPath);
    } catch {}
  }
  try {
    await fs.rename(logPath, logPath + '.1');
  } catch {}
  logSize = 0;
}

async function writeToFile(line) {
  if (!logPath) return;
  line += '\n';
  logSize += Buffer.byteLength(line);
  if (logSize >= MAX_LOG_SIZE) {
    await rotateLog();
  }
  try {
    await fs.appendFile(logPath, line, 'utf8');
  } catch {}
}

function log(level, msg, meta) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString();
  const useJson = process.env.NOKTA_LOG_FORMAT === 'json';

  if (useJson) {
    const entry = { timestamp: ts, level, message: msg, ...meta };
    const line = JSON.stringify(entry);
    process.stderr.write(line + '\n');
    if (logPath) writeToFile(line);
  } else {
    const color = COLORS[level];
    const prefix = `\x1b[${color}m[${level.toUpperCase()}]\x1b[0m`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `${ts} ${prefix} ${msg}${metaStr}`;
    process.stderr.write(line + '\n');
    if (logPath) {
      const plainLine = `${ts} [${level.toUpperCase()}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
      writeToFile(plainLine);
    }
  }
}

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  child: (defaultMeta) => {
    const child = {};
    for (const lvl of Object.keys(LEVELS)) {
      child[lvl] = (msg, meta) => log(lvl, msg, { ...defaultMeta, ...meta });
    }
    return child;
  },
};
