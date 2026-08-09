import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  '.cache',
  '.ai/trail/events',
  'vendor',
  '.bundle',
]);

const WATCH_EXTS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.rs',
  '.go',
  '.rb',
  '.php',
  '.ex',
  '.exs',
  '.hs',
  '.scala',
  '.sc',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.vue',
  '.svelte',
  '.astro',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.toml',
  '.sql',
  '.prisma',
  '.graphql',
  '.cs',
  '.fs',
  '.sh',
  '.tf',
]);

export class FileWatcher {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.debounceMs = options.debounceMs || 500;
    this.onChange = options.onChange || null;
    this._watchers = [];
    this._debounceTimers = {};
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;

    try {
      fs.accessSync(this.projectRoot);
    } catch {
      this.log.warn(`Watcher: project root not accessible: ${this.projectRoot}`);
      return;
    }

    this._watchRecursive(this.projectRoot);
    this.log.info(`File watcher started on ${this.projectRoot}`);
  }

  stop() {
    this._running = false;
    for (const timer of Object.values(this._debounceTimers)) {
      clearTimeout(timer);
    }
    this._debounceTimers = {};
    for (const w of this._watchers) {
      try {
        w.close();
      } catch {}
    }
    this._watchers = [];
  }

  _watchRecursive(dir) {
    try {
      const watcher = fs.watch(dir, { recursive: false }, (eventType, filename) => {
        if (!filename || !this._running) return;
        this._handleChange(dir, filename, eventType);
      });
      this._watchers.push(watcher);
    } catch {}

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      this._watchRecursive(fullPath);
    }
  }

  _handleChange(dir, filename, eventType) {
    const ext = path.extname(filename).toLowerCase();
    if (!WATCH_EXTS.has(ext)) return;

    const fullPath = path.join(dir, filename);
    let relativePath;
    try {
      relativePath = path.relative(this.projectRoot, fullPath);
    } catch {
      return;
    }

    const key = relativePath;
    if (this._debounceTimers[key]) {
      clearTimeout(this._debounceTimers[key]);
    }

    this._debounceTimers[key] = setTimeout(() => {
      if (!this._running) return;
      delete this._debounceTimers[key];

      const change = {
        file: relativePath,
        fullPath,
        ext,
        eventType,
        timestamp: new Date().toISOString(),
      };

      this.log.debug(`File changed: ${relativePath} (${eventType})`);

      if (this.onChange) {
        try {
          this.onChange(change);
        } catch (err) {
          this.log.error(`Watcher onChange error: ${err.message}`);
        }
      }
    }, this.debounceMs);
  }
}
