import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Never send daemon secrets to project commands. CLI login remains in the user's own home.
function runnerEnv({ credentials = false } = {}) {
  const keys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'];
  if (credentials) keys.push('CODEX_HOME', 'OPENAI_API_KEY');
  return Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
}
export function runCommand(command, args, { cwd, signal, input, timeoutMs = 1200000, onOutput = () => {}, credentials = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Paused by user'));
    const child = spawn(command, args, { cwd, env: runnerEnv({ credentials }), shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let reason = '';
    let killTimer;
    const kill = (sig) => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch { /* Already exited. */ }
    };
    const stop = (message) => {
      reason = message;
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 1500);
      killTimer.unref();
    };
    const timer = setTimeout(() => stop('Command timed out'), timeoutMs);
    const abort = () => stop('Paused by user');
    signal?.addEventListener('abort', abort, { once: true });
    const collect = chunk => {
      const text = chunk.toString();
      output = (output + text).slice(-16000);
      onOutput(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.stdin.on('error', () => {});
    const cleanup = () => {
      clearTimeout(timer);
      // A cancelled process may have surviving grandchildren; keep the group kill timer.
      if (!reason) clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => { cleanup(); resolve({ code, output, error: reason || (code === 0 ? null : `Command exited ${code}`) }); });
    child.stdin.end(input || '');
  });
}

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const schemas = {
  analyze: object({ summary: string, tasks: { type: 'array', maxItems: 10, items: object({ title: string, description: string, acceptanceCriteria: strings, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] } }) } }),
  execute: object({ summary: string, completed: { type: 'boolean' } }),
  review: object({ summary: string, approved: { type: 'boolean' }, issues: strings }),
};

export class CodexRunner {
  async available() {
    try {
      const result = await runCommand('codex', ['--version'], { timeoutMs: 5000, credentials: true });
      return { id: 'codex', name: 'Codex CLI', installed: result.code === 0, version: result.output.trim() };
    } catch {
      return { id: 'codex', name: 'Codex CLI', installed: false, version: 'Install Codex CLI and run codex login in your terminal.' };
    }
  }
  async run({ phase, rootPath, model, prompt, signal, onOutput }) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-codex-'));
    try {
      const schemaPath = path.join(temporary, 'schema.json');
      const responsePath = path.join(temporary, 'response.json');
      await fs.writeFile(schemaPath, JSON.stringify(schemas[phase]));
      const result = await runCommand('codex', ['exec', '-c', 'approval_policy="never"', '--sandbox', phase === 'execute' ? 'workspace-write' : 'read-only', '--model', model, '--cd', rootPath, '--skip-git-repo-check', '--ephemeral', '--json', '--output-schema', schemaPath, '--output-last-message', responsePath, '-'], { cwd: rootPath, signal, input: prompt, onOutput, credentials: true });
      if (result.error) throw new Error(`${result.error}: ${result.output.slice(-2000)}`);
      let response;
      try { response = JSON.parse(await fs.readFile(responsePath, 'utf8')); }
      catch { throw new Error('Codex did not return a valid structured result. Check CLI login, model access, and logs.'); }
      if (typeof response.summary !== 'string') throw new Error('Codex response is missing a summary');
      if (phase === 'execute' && typeof response.completed !== 'boolean') throw new Error('Invalid execution result');
      if (phase === 'review' && (typeof response.approved !== 'boolean' || !Array.isArray(response.issues))) throw new Error('Invalid review result');
      return response;
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}
