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
  '.nokta',
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

export class AutoWatcher {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.debounceMs = options.debounceMs || 2000;
    this.orchestrator = options.orchestrator || null;
    this.sprintEngine = options.sprintEngine || null;
    this._watchers = [];
    this._debounceTimers = {};
    this._running = false;
    this._changeQueue = [];
    this._processing = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    try {
      fs.accessSync(this.projectRoot);
    } catch {
      this.log.warn(`AutoWatcher: project root not accessible: ${this.projectRoot}`);
      return;
    }
    this._watchRecursive(this.projectRoot);
    this.log.info(`AutoWatcher started on ${this.projectRoot}`);
  }

  stop() {
    this._running = false;
    for (const t of Object.values(this._debounceTimers)) clearTimeout(t);
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
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      this._watchRecursive(path.join(dir, e.name));
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
    if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key]);

    this._debounceTimers[key] = setTimeout(() => {
      if (!this._running) return;
      delete this._debounceTimers[key];
      const change = { file: relativePath, fullPath, ext, eventType, timestamp: new Date().toISOString() };
      this.log.debug(`File changed: ${relativePath} (${eventType})`);

      // Always notify sprint engine for auto-update
      if (this.sprintEngine) {
        this.sprintEngine.autoUpdate(change).catch(() => {});
      }

      // Queue for autonomous agent processing
      this._changeQueue.push(change);
      this._processQueue();
    }, this.debounceMs);
  }

  async _processQueue() {
    if (this._processing || !this.orchestrator) return;
    this._processing = true;

    while (this._changeQueue.length > 0) {
      const change = this._changeQueue.shift();

      // Check if change is significant enough to trigger an agent run
      if (!this._isSignificant(change)) continue;

      try {
        const goal = `Review and respond to file change in ${change.file} (${change.eventType})`;
        const context = {
          relatedFiles: [change.file],
          trigger: 'file_watch',
          autoRun: true,
        };

        const run = await this.orchestrator.autoGenerateRun(goal, 'automatic', context);
        this.log.info(`AutoRun created: ${run.id} for ${change.file}`);

        // Execute in background
        this.orchestrator.executeRun(run.id).catch((err) => {
          this.log.error(`AutoRun ${run.id} failed: ${err.message}`);
        });
      } catch (err) {
        this.log.error(`AutoRun creation failed: ${err.message}`);
      }

      // Rate limit: at most one auto-run per 30 seconds
      await new Promise((r) => setTimeout(r, 30000));
    }

    this._processing = false;
  }

  _isSignificant(change) {
    // Ignore changes to lock files, configs, etc unless they're new
    const basename = path.basename(change.file);
    if (basename === 'package-lock.json' || basename === 'yarn.lock' || basename === 'pnpm-lock.yaml') return false;
    if (basename.startsWith('.')) return false;
    // Only trigger on adds and changes, not deletes (too noisy)
    if (change.eventType === 'delete') return false;
    return true;
  }
}
