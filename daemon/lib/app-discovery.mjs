import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { IGNORE_DIRS } from './search-ignore.mjs';

// A folder is an app when it carries a repo or a build manifest. These files
// identify a project in any language or toolchain the daemon can work on.
export const MANIFEST_FILES = new Set([
  'package.json',
  'deno.json',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'pubspec.yaml',
  'Package.swift',
  'CMakeLists.txt',
  'mix.exs',
]);

// Home-scale folders that never hold a source project but would slow a scan of
// a whole home directory down. IGNORE_DIRS covers the build and dependency
// folders shared by every root; these are only relevant when a root is a whole
// user directory, and roots are meant to be folders that hold code.
const NEVER_PROJECTS = new Set(['Library', 'Applications', 'Music', 'Movies', 'Pictures', 'Photos', 'Public', 'Volumes']);

// Roots are comma-separated so a machine can opt into scanning only the
// folders that hold code; without configuration the home directory is scanned.
// A root the user configured is explicitly chosen and may be reported as an app
// itself; the implicit home directory may only be walked, because it is often a
// dotfiles repository that still needs searching. `scanRoots` returns both
// decisions from one read of the environment so callers cannot disagree.
export function scanRoots(env = process.env) {
  const configured = String(env.NOKTA_APP_DISCOVERY_ROOTS || '').split(',').map(part => part.trim()).filter(Boolean);
  return configured.length
    ? { roots: configured, includeRoots: true }
    : { roots: [env.HOME || env.USERPROFILE || os.homedir()], includeRoots: false };
}

export function defaultRoots(env = process.env) {
  return scanRoots(env).roots;
}

function budget(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

// Breadth-first so a shallow app is always found before the depth budget runs
// out. A folder that is itself a project is not descended into: a monorepo's
// packages are parts of one app, not separate projects.
//
// `includeRoots` decides whether a root that is itself an app can be reported.
// It is on for roots the user configured (pointing at one project is the
// documented way to narrow a scan) and off for the implicit home directory,
// which is frequently a dotfiles repository and must still be walked.
export async function discoverApps({
  roots = defaultRoots(),
  includeRoots = false,
  maxDepth = budget(process.env.NOKTA_APP_DISCOVERY_DEPTH, 2, 6),
  limit = budget(process.env.NOKTA_APP_DISCOVERY_LIMIT, 50, 200),
  maxDirs = budget(process.env.NOKTA_APP_DISCOVERY_MAX_DIRS, 4000, 20000),
} = {}) {
  // Resolve symlinks the same way the service does when it stores a project,
  // so a discovered path can be compared directly with a registered one.
  const resolved = [];
  for (const root of roots) resolved.push(await fs.realpath(root).catch(() => path.resolve(root)));
  const candidates = [];
  const visited = new Set();
  const queue = resolved.map(dir => ({ dir, depth: 0 }));
  let scanned = 0;

  while (queue.length && candidates.length < limit && scanned < maxDirs) {
    const { dir, depth } = queue.shift();
    if (visited.has(dir)) continue;
    visited.add(dir);
    scanned += 1;
    const entries = await readEntries(dir);
    if (!entries) continue;
    const hasGit = entries.some(entry => entry.name === '.git');
    const manifests = entries.filter(entry => MANIFEST_FILES.has(entry.name)).map(entry => entry.name).sort();
    if ((depth > 0 || includeRoots) && (manifests.length || hasGit)) {
      candidates.push({ path: dir, name: path.basename(dir), hasGit, manifests });
      continue;
    }
    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      // isDirectory() is false for symlinks, which also keeps the walk from
      // looping back on itself.
      if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name) || NEVER_PROJECTS.has(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  candidates.sort((a, b) => a.path.localeCompare(b.path));
  // A non-empty queue means the walk stopped early — a partial answer must say
  // so rather than read as "this is everything on the machine".
  return { roots: resolved, candidates, scanned, truncated: queue.length > 0 };
}

async function readEntries(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable folders (permissions, deleted mid-scan) are simply not apps.
    return null;
  }
}
