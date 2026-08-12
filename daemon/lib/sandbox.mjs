import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MEMORY_LIMIT = '256m';
const DEFAULT_IMAGE = 'node:22-alpine';

function randomId() {
  return 'sbx-' + Math.random().toString(36).slice(2, 10);
}

class SandboxResult {
  constructor({ stdout, stderr, exitCode, error, timedOut, durationMs }) {
    this.stdout = stdout || '';
    this.stderr = stderr || '';
    this.exitCode = exitCode || 0;
    this.error = error || null;
    this.timedOut = timedOut || false;
    this.durationMs = durationMs || 0;
  }

  get passed() {
    return this.exitCode === 0 && !this.error;
  }

  toJSON() {
    return {
      stdout: this.stdout,
      stderr: this.stderr,
      exitCode: this.exitCode,
      passed: this.passed,
      timedOut: this.timedOut,
      durationMs: this.durationMs,
    };
  }
}

export class SandboxManager {
  constructor(options = {}) {
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.memoryLimit = options.memoryLimit || DEFAULT_MEMORY_LIMIT;
    this.image = options.image || DEFAULT_IMAGE;
    this.workspace = options.workspace || path.join(process.cwd(), '.nokta', 'sandbox');
    this._dockerChecked = false;
    this.useDocker = false;
    if (options.useDocker !== undefined) {
      this.useDocker = options.useDocker;
    }
  }

  async _ensureDockerAvailable() {
    if (this._dockerChecked) return this.useDocker;
    this._dockerChecked = true;
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
        stdio: 'pipe',
        timeout: 5000,
      });
      this.useDocker = true;
    } catch {
      this.useDocker = false;
    }
    return this.useDocker;
  }

  async _ensureWorkspace() {
    await fs.mkdir(this.workspace, { recursive: true });
  }

  async _writeTempFile(code, filePath) {
    await this._ensureWorkspace();
    const fullPath = path.join(this.workspace, filePath || `${randomId()}.mjs`);
    await fs.writeFile(fullPath, code, 'utf8');
    return fullPath;
  }

  async _runDocker(filePath, options = {}) {
    const _timeoutSec = Math.ceil((options.timeoutMs || this.timeoutMs) / 1000);
    const containerId = randomId();
    const fileName = path.basename(filePath);
    const workspaceDir = path.dirname(filePath);

    const cmd = [
      'docker', 'run', '--rm',
      '--name', containerId,
      '-v', `${workspaceDir}:/workspace`,
      '--workdir', '/workspace',
      '--memory', options.memoryLimit || this.memoryLimit,
      '--network', 'none',
      '--read-only',
      this.image,
      'node', fileName,
    ];

    return new Promise((resolve) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      const proc = spawn(cmd[0], cmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeoutMs || this.timeoutMs,
      });

      proc.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
      proc.stderr?.on('data', (chunk) => (stderr += chunk.toString()));

      let timedOut = false;
      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            try {
              proc.kill('SIGKILL');
            } catch {}
            try {
              spawn('docker', ['rm', '-f', containerId], { stdio: 'ignore' });
            } catch {}
          }, options.timeoutMs)
        : null;

      proc.on('error', (err) => {
        if (timer) clearTimeout(timer);
        resolve(new SandboxResult({
          stdout,
          stderr,
          exitCode: -1,
          error: err.message,
          timedOut,
          durationMs: Date.now() - start,
        }));
      });

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve(new SandboxResult({
          stdout,
          stderr,
          exitCode: code,
          timedOut,
          durationMs: Date.now() - start,
        }));
      });
    });
  }

  async _runNode(filePath, options = {}) {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    return new Promise((resolve) => {
      const proc = spawn(process.execPath, [filePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeoutMs || this.timeoutMs,
        cwd: path.dirname(filePath),
        env: {
          NODE_OPTIONS: '--no-warnings',
          NODE_ENV: 'test',
        },
      });

      proc.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
      proc.stderr?.on('data', (chunk) => (stderr += chunk.toString()));

      let timedOut = false;
      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            try {
              proc.kill('SIGKILL');
            } catch {}
          }, options.timeoutMs)
        : null;

      proc.on('error', (err) => {
        if (timer) clearTimeout(timer);
        resolve(new SandboxResult({
          stdout,
          stderr,
          exitCode: -1,
          error: err.message,
          timedOut,
          durationMs: Date.now() - start,
        }));
      });

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve(new SandboxResult({
          stdout,
          stderr,
          exitCode: code,
          timedOut,
          durationMs: Date.now() - start,
        }));
      });
    });
  }

  async execFile(filePath, options = {}) {
    const useDocker = options.useDocker !== undefined ? options.useDocker : await this._ensureDockerAvailable();
    let result;
    if (useDocker) {
      try {
        this.log.debug(`Using Docker sandbox for ${filePath}`);
        result = await this._runDocker(filePath, options);
        if (result.exitCode !== 0 && result.stderr && result.error === null) {
          const dockerErr = result.stderr.toLowerCase();
          if (dockerErr.includes('docker') || dockerErr.includes('socket') || dockerErr.includes('credential') || dockerErr.includes('image') || dockerErr.includes('daemon')) {
            this.log.warn(`Docker failed, falling back to Node: ${result.stderr.slice(0, 200)}`);
            result = await this._runNode(filePath, options);
          }
        }
      } catch (err) {
        this.log.warn(`Docker sandbox failed, falling back to Node: ${err.message}`);
        result = await this._runNode(filePath, options);
      }
    } else {
      result = await this._runNode(filePath, options);
    }
    return result;
  }

  async exec(code, options = {}) {
    const filePath = await this._writeTempFile(code, options.fileName);
    const _filename = options.fileName || path.basename(filePath);
    return this.execFile(filePath, { ...options, timeoutMs: options.timeoutMs });
  }

  async cleanup() {
    try {
      await fs.rm(this.workspace, { recursive: true, force: true });
    } catch {}
  }
}
