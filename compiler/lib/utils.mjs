import fs from 'node:fs';
import path from 'node:path';

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.ai/trail/events',
]);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export function walkFiles(root, options = {}) {
  const limit = options.limit ?? 3000;
  const files = [];
  const absoluteRoot = path.resolve(root);

  function walk(currentDir) {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= limit) return;
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toPosix(path.relative(absoluteRoot, absolutePath));
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || IGNORE_DIRS.has(relativePath)) continue;
        walk(absolutePath);
        continue;
      }
      if (entry.isFile()) files.push(relativePath);
    }
  }

  walk(absoluteRoot);
  return files;
}
