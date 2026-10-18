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

// Home-scale folders that never hold a source project but would slow a scan
// of the whole home directory down. IGNORE_DIRS covers the build and
// dependency folders shared by every root.
const NEVER_PROJECTS = new Set(['Library', 'Applications', 'Music', 'Movies', 'Pictures', 'Photos', 'Public', 'Volumes']);

// Roots are comma-separated so a machine can opt into scanning only the
// folders that hold code; without configuration the home directory is scanned.
export function defaultRoots(env = process.env) {
  const configured = String(env.NOKTA_DISCOVERY_ROOTS || '').split(',').map(part => part.trim()).filter(Boolean);
  return configured.length ? configured : [env.HOME || env.USERPROFILE || os.homedir()];
}

// Breadth-first so a shallow app is always found before the depth budget runs
// out. A folder that is itself a project is not descended into: a monorepo's
// packages are parts of one app, not separate projects.
export async function discoverApps({ roots = defaultRoots(), maxDepth = Number(process.env.NOKTA_DISCOVERY_DEPTH) || 2, limit = Number(process.env.NOKTA_DISCOVERY_LIMIT) || 50, maxDirs = 4000 } = {}) {
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
    const manifests = entries.filter(entry => MANIFEST_FILES.has(entry.name)).map(entry => entry.name).sort();
    if (depth > 0 && (manifests.length || entries.some(entry => entry.name === '.git'))) {
      candidates.push({ path: dir, name: path.basename(dir), hasGit: entries.some(entry => entry.name === '.git'), manifests });
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
  return { roots: resolved, candidates };
}

async function readEntries(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable folders (permissions, deleted mid-scan) are simply not apps.
    return null;
  }
}
