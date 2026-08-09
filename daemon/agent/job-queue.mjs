import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSafeEnv } from '../lib/safe-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AgentJobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 2;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this._queue = [];
    this._active = new Map();
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._processNext();
    this.log.info(`AgentJobQueue started (concurrency: ${this.concurrency})`);
  }

  stop() {
    this._running = false;
    for (const [_runId, worker] of this._active) {
      try {
        worker.kill('SIGTERM');
      } catch {}
    }
    this._active.clear();
    this._queue = [];
  }

  enqueue(runId, options = {}) {
    return new Promise((resolve, reject) => {
      const job = { runId, options, resolve, reject };
      this._queue.push(job);
      this.log.debug(`Job enqueued: ${runId} (queue length: ${this._queue.length})`);
      this.emit('job:queued', { runId });
      this._processNext();
    });
  }

  getStatus(runId) {
    if (this._active.has(runId)) return 'running';
    if (this._queue.some((j) => j.runId === runId)) return 'queued';
    return null;
  }

  getQueueLength() {
    return this._queue.length;
  }

  getActiveCount() {
    return this._active.size;
  }

  _processNext() {
    if (!this._running) return;
    while (this._active.size < this.concurrency && this._queue.length > 0) {
      const job = this._queue.shift();
      this._execute(job);
    }
  }

  _execute(job) {
    const { runId, options, resolve, reject } = job;
    this.log.info(`Executing job: ${runId}`);

    const workerPath = path.join(__dirname, 'job-worker.mjs');
    const env = {
      ...createSafeEnv(),
      NOKTA_JOB_RUN_ID: runId,
      NOKTA_JOB_PROJECT_ROOT: options.projectRoot || process.cwd(),
      NOKTA_JOB_TIMEOUT: String(options.timeout || 300000),
    };

    if (options.userId) env.NOKTA_JOB_USER_ID = options.userId;

    const worker = spawn('node', [workerPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._active.set(runId, worker);

    let stdout = '';
    let stderr = '';

    worker.stdout.on('data', (data) => {
      stdout += data.toString();
      // Parse progress lines
      const lines = data
        .toString()
        .split('\n')
        .filter((l) => l.trim());
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type) this.emit(msg.type, { runId, ...msg.data });
        } catch {}
      }
    });

    worker.stderr.on('data', (data) => {
      stderr += data.toString();
      this.log.debug(`[worker ${runId}] ${data.toString().trim()}`);
    });

    worker.on('close', (code) => {
      this._active.delete(runId);
      if (code === 0) {
        this.log.info(`Job completed: ${runId}`);
        this.emit('job:completed', { runId, output: stdout });
        resolve({ success: true, runId });
      } else {
        this.log.error(`Job failed: ${runId} (exit code: ${code})`);
        this.emit('job:failed', { runId, error: stderr || `Exit code ${code}` });
        reject(new Error(stderr || `Worker exited with code ${code}`));
      }
      this._processNext();
    });

    worker.on('error', (err) => {
      this._active.delete(runId);
      this.log.error(`Job error: ${runId}: ${err.message}`);
      this.emit('job:failed', { runId, error: err.message });
      reject(err);
      this._processNext();
    });
  }
}
