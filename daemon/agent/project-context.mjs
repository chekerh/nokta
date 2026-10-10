import fs from 'node:fs/promises';
import path from 'node:path';

// Directories that never contain project source worth showing a planner.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
]);

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.php',
  '.cs',
  '.swift',
  '.sql',
  '.sh',
]);

const TEST_PATTERN = /(^|[./-])(test|tests|spec|__tests__)([./-]|$)|\.(test|spec)\.[a-z]+$/i;

const CACHE_TTL_MS = 60_000;
const cache = new Map();

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function listDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Summarizes the real shape of a project so a planner model stops inventing
 * file paths and stacks. Everything here is bounded and cached, because it runs
 * on the request path of every /auto run.
 */
export async function buildProjectContext(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const maxFiles = options.maxFiles ?? 200;
  const maxDepth = options.maxDepth ?? 4;
  const now = Date.now();

  const hit = cache.get(root);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const pkg = await readJson(path.join(root, 'package.json'));
  const topEntries = (await listDir(root))
    .filter((e) => !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort();

  const extensions = new Map();
  const sourceFiles = [];
  const testFiles = [];
  let visited = 0;
  let truncated = false;

  const walk = async (dir, depth) => {
    if (depth > maxDepth) return;
    const entries = await listDir(dir);
    for (const entry of entries) {
      if (visited > 4000) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      visited++;
      const ext = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const rel = path.relative(root, full);
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
      if (TEST_PATTERN.test(rel)) {
        if (testFiles.length < 20) testFiles.push(rel);
      } else if (sourceFiles.length < maxFiles) {
        sourceFiles.push(rel);
      }
    }
  };
  await walk(root, 0);

  const dominant = [...extensions.entries()].sort((a, b) => b[1] - a[1]);
  const stack = dominant.length ? dominant[0][0] : null;
  const scripts = pkg?.scripts ? Object.keys(pkg.scripts) : [];

  const value = {
    root,
    isNode: !!pkg,
    packageName: pkg?.name || null,
    moduleType: pkg?.type || null,
    runCommand: scripts.find((s) => s === 'start' || s === 'dev') || null,
    testCommand: scripts.find((s) => s === 'test' || s === 'test:unit') || null,
    lintCommand: scripts.find((s) => s === 'lint') || null,
    buildCommand: scripts.find((s) => s === 'build') || null,
    scriptNames: scripts,
    topLevel: topEntries,
    stack,
    fileTypes: dominant.map(([ext, count]) => `${ext} (${count})`),
    entrypoints: sourceFiles.filter((f) => /(^|\/)(index|main|server|cli|app)\.[a-z]+$/.test(f)).slice(0, 10),
    sampleFiles: sourceFiles.slice(0, 40),
    testFiles,
    truncated,
  };

  cache.set(root, { at: now, value });
  return value;
}

/** Renders the context as a compact block for a planner prompt. */
export function renderProjectContext(ctx) {
  if (!ctx) return 'Project context unavailable.';
  const lines = [];
  if (ctx.packageName) {
    lines.push(`Project: ${ctx.packageName}${ctx.moduleType ? ` (${ctx.moduleType} modules)` : ''}`);
  }
  lines.push(`Primary language/stack: ${ctx.stack || 'unknown'}`);
  if (ctx.fileTypes.length) lines.push(`File types present: ${ctx.fileTypes.join(', ')}`);
  if (ctx.topLevel.length) lines.push(`Top level: ${ctx.topLevel.join(' ')}`);
  if (ctx.entrypoints.length) lines.push(`Likely entrypoints: ${ctx.entrypoints.join(', ')}`);
  if (ctx.testCommand) lines.push(`Test command: npm run ${ctx.testCommand}`);
  if (ctx.lintCommand) lines.push(`Lint command: npm run ${ctx.lintCommand}`);
  if (ctx.testFiles.length)
    lines.push(`Test files (${ctx.testFiles.length}+): ${ctx.testFiles.slice(0, 10).join(', ')}`);
  if (ctx.sampleFiles.length) lines.push(`Sample source files: ${ctx.sampleFiles.slice(0, 20).join(', ')}`);
  if (ctx.truncated) lines.push('(file listing was truncated)');
  lines.push(
    '',
    'Rules: use these exact file paths, extensions and directories. Never invent a stack or',
    'directory that is not listed above. Prefer editing a file that already exists over creating one.',
  );
  return lines.join('\n');
}

export function clearProjectContextCache() {
  cache.clear();
}
