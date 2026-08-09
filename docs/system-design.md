# Nokta System Design: Concrete Implementation Plans

## Purpose

This document provides exact, implementable designs for every critical system fix and new module. Each design includes:

- Exact file paths and function signatures
- Data structures and interfaces
- Integration points with existing code
- Migration steps

---

## 1. Security Fixes (Phase 0)

### 1.1 Shell Injection Fix — `daemon/agent/executor.mjs`

**Current Problem:** `execSync(step.command)` passes raw AI-generated strings to the shell.

**Design:**

```javascript
// NEW: daemon/lib/sandbox-exec.mjs
import { execSync } from 'node:child_process';

const BLOCKED_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\b/,
  /\bmkfs\b/,
  /\bfdisk\b/,
  /\bshred\b/,
  /\b:(){ :\|:& };:/, // fork bomb
  /\bcurl\b.*\|\s*sh/,
  /\bwget\b.*\|\s*sh/,
  /\beval\b/,
  /\bexec\b/,
  /\bchild_process\b/,
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
  /\bprocess\.exit\b/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /\b>\s*\/dev\/sd/,
];

const ALLOWED_COMMANDS_PREFIX = [
  'git ',
  'npm ',
  'npx ',
  'yarn ',
  'pnpm ',
  'bun ',
  'node ',
  'python3 ',
  'python ',
  'pip ',
  'cargo ',
  'rustc ',
  'go ',
  'javac ',
  'java ',
  'docker ',
  'docker-compose ',
  'make ',
  'cmake ',
  'gradle ',
  'mvn ',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'mkdir',
  'cp',
  'mv',
  'touch',
  'echo',
  'eslint',
  'prettier',
  'tsc',
  'jest',
  'vitest',
  'pytest',
];

export function validateShellCommand(command) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('Shell command must be a non-empty string');
  }
  if (command.length > 4096) {
    throw new Error('Shell command too long (max 4096 chars)');
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked dangerous command: ${pattern.source}`);
    }
  }

  const firstWord = command.trim().split(/\s+/)[0].toLowerCase();
  const isAllowed = ALLOWED_COMMANDS_PREFIX.some((p) => firstWord === p.trim().split(/\s+/)[0].toLowerCase());
  if (!isAllowed) {
    throw new Error(`Command not in allowlist: ${firstWord}`);
  }

  return true;
}

export function safeExecSync(command, options = {}) {
  validateShellCommand(command);
  return execSync(command, {
    ...options,
    timeout: options.timeout || 30000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
  });
}
```

**Changes to `executor.mjs`:**

- Line 49: Replace `execSync(cmd, ...)` with `safeExecSync(cmd, ...)`
- Lines 129-136: Replace string interpolation with `execFileSync` array form
- Line 92: Validate `branch` parameter against `^[a-zA-Z0-9._\-/]+$`

### 1.2 Path Traversal Fix — `daemon/agent/executor.mjs`

**Current Problem:** `path.resolve(projectRoot, step.file)` doesn't verify the result is within `projectRoot`.

**Design:**

```javascript
// NEW: daemon/lib/path-guard.mjs
import * as path from 'node:path';

export function safePath(projectRoot, filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  const resolved = path.resolve(projectRoot, filePath);
  const normalizedRoot = path.resolve(projectRoot);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path traversal blocked: ${filePath} resolves outside project root`);
  }

  // Block hidden directories
  const parts = resolved.split(path.sep);
  for (const part of parts) {
    if (part.startsWith('.') && part !== '.' && part !== '..' && part !== '.nokta') {
      // Allow .nokta but block others
      if (part !== '.git' && part !== '.env') {
        // Allow .git and .env for git operations
      }
    }
  }

  // Block specific dangerous paths
  const blocked = ['.git/config', '.env', '/etc/', '/usr/', '/bin/', '/sbin/'];
  for (const b of blocked) {
    if (resolved.includes(b)) {
      throw new Error(`Access to ${b} is restricted`);
    }
  }

  return resolved;
}
```

**Changes to `executor.mjs`:**

- Line 65: Replace `path.resolve(...)` with `safePath(projectRoot, step.file)`

### 1.3 PR Step Injection Fix — `daemon/agent/executor.mjs`

**Current Problem:** `prTitle` and `prBody` interpolated into shell command strings.

**Design:**

```javascript
// Replace lines 129-146 with:
case 'pr': {
  const { owner, repo, title, body, head, base } = step;
  const ghToken = process.env.GITHUB_TOKEN;
  const prTitle = sanitizeShellArg(title || `[Nokta] ${run.goal}`);
  const prBody = sanitizeShellArg(body || `Automated by Nokta agent run ${run.id}`);
  const prHead = head || `nokta-run-${run.id}`;
  const prBase = base || 'main';

  if (ghToken && owner && repo) {
    // ... GitHub API call (unchanged, uses fetch not shell)
  } else {
    try {
      const cwd = context.projectRoot || process.cwd();
      try {
        execSync(`git checkout -b "${prHead}" 2>/dev/null || git checkout "${prHead}"`, { cwd });
        execSync('git add .', { cwd });
        execSync(`git commit -m ${JSON.stringify(prTitle)} --no-verify`, { cwd });
        execSync(`git push -u origin "${prHead}" --force`, { cwd });
      } catch (gitErr) { /* ignore */ }

      // Use execFileSync with array args instead of string interpolation
      const { execFileSync } = await import('node:child_process');
      const prUrl = execFileSync('gh', [
        'pr', 'create',
        '--title', prTitle,
        '--body', prBody,
        '--head', prHead,
        '--base', prBase
      ], { cwd, encoding: 'utf8', timeout: 30000 });

      stepResult.output = `PR created via CLI: ${prUrl.trim()}`;
      stepResult.meta = { prUrl: prUrl.trim(), localCli: true };
    } catch (cliErr) {
      throw new Error(`Failed to create PR: ${cliErr.message}`);
    }
  }
  break;
}

function sanitizeShellArg(str) {
  // Remove null bytes and limit length
  return String(str).replace(/\0/g, '').slice(0, 1000);
}
```

### 1.4 Environment Variable Isolation — `daemon/agent/job-queue.mjs`

**Current Problem:** `process.env` passed entirely to spawned workers.

**Design:**

```javascript
// NEW: daemon/lib/safe-env.mjs
const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'NOKTA_DATA_DIR',
  // Explicitly NOT including:
  // NOKTA_ENCRYPTION_KEY, NOKTA_JWT_SECRET,
  // OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
];

export function getSafeEnv() {
  const safe = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key];
    }
  }
  return safe;
}
```

**Changes to `job-queue.mjs`:**

- Line 80: Replace `env: process.env` with `env: { ...getSafeEnv(), NOKTA_JOB_RUN_ID: job.runId, NOKTA_JOB_USER_ID: job.options.userId || '' }`

### 1.5 Session Revocation — `daemon/lib/auth.mjs`

**Design:**

```javascript
// NEW: daemon/lib/token-blacklist.mjs
import { getDb } from '../db/connection.mjs';

// In-memory LRU for fast lookups (max 10000 entries)
const blacklist = new Map();
const MAX_ENTRIES = 10000;

export function blacklistToken(jti, expiresAt) {
  if (blacklist.size >= MAX_ENTRIES) {
    // Evict oldest
    const firstKey = blacklist.keys().next().value;
    blacklist.delete(firstKey);
  }
  blacklist.set(jti, expiresAt);
}

export function isBlacklisted(jti) {
  if (!jti) return false;

  const expiresAt = blacklist.get(jti);
  if (!expiresAt) return false;

  // Clean up expired entries
  if (new Date(expiresAt) < new Date()) {
    blacklist.delete(jti);
    return true;
  }

  return true;
}

// Load blacklisted tokens from DB on startup
export function loadBlacklist() {
  const db = getDb();
  const rows = db.prepare("SELECT token_id, expires_at FROM token_blacklist WHERE expires_at > datetime('now')").all();
  for (const row of rows) {
    blacklist.set(row.token_id, row.expires_at);
  }
}

// Periodic cleanup
export function startBlacklistCleanup() {
  setInterval(() => {
    const now = new Date().toISOString();
    for (const [jti, expiresAt] of blacklist) {
      if (expiresAt < now) blacklist.delete(jti);
    }
  }, 60000).unref();
}
```

**Changes to `auth.mjs`:**

```javascript
import { blacklistToken, isBlacklisted } from './token-blacklist.mjs';
import { randomBytes } from 'node:crypto';

// Add jti to token payload
export function createToken(payload) {
  const jti = randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60;

  const data = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    tier: payload.tier, // NEW: include tier
    jti, // NEW: unique token ID
    iat: now,
    exp: now + TOKEN_EXPIRY_SEC,
  };

  const secret = getSecret();
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(Buffer.from(JSON.stringify(data)));
  const signature = base64url(hmacSha256(secret, `${header}.${body}`));

  return `${header}.${body}.${signature}`;
}

// Check blacklist in verifyToken
export function verifyToken(token) {
  try {
    if (isBlacklisted(token)) return null; // NEW: check blacklist

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const secret = getSecret();
    const expected = base64url(hmacSha256(secret, `${header}.${body}`));

    // Use timing-safe comparison
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// Add logout endpoint
export function blacklistCurrentToken(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const payload = verifyToken(token);
    if (payload?.jti) {
      blacklistToken(payload.jti, new Date(payload.exp * 1000).toISOString());
    }
  }
}
```

**New DB migration (v3):**

```sql
CREATE TABLE IF NOT EXISTS token_blacklist (
  token_id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
```

### 1.6 Login Rate Limiting — `daemon/routes/auth.mjs`

```javascript
// NEW: daemon/lib/login-rate-limit.mjs
const loginAttempts = new Map(); // ip -> { count, resetAt }

export function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 }); // 1 minute window
    return { allowed: true, remaining: 4 };
  }

  if (record.count >= 5) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }

  record.count++;
  return { allowed: true, remaining: 5 - record.count };
}

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now > record.resetAt) loginAttempts.delete(ip);
  }
}, 300000).unref();
```

**Changes to `routes/auth.mjs`:**

```javascript
import { checkLoginRateLimit } from '../lib/login-rate-limit.mjs';

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const rateCheck = checkLoginRateLimit(ip);

    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Too many login attempts',
        retryAfter: rateCheck.retryAfter,
      });
    }

    // ... existing login logic

    // On successful login, reset counter
    loginAttempts.delete(ip);
  }),
);
```

### 1.7 Atomic File Writes — Multiple Files

```javascript
// NEW: daemon/lib/atomic-write.mjs
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export async function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw err;
  }
}

export async function atomicRead(filePath, fallback = null) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}
```

**Changes to affected files:**

- `sprint-engine.mjs` line 94: Replace `fs.writeFile(...)` with `atomicWrite(...)`
- `cost-tracker.mjs` line 55: Replace `fs.writeFile(...)` with `atomicWrite(...)`
- `storage.mjs`: Replace file writes with `atomicWrite(...)`

### 1.8 Fix `removeProject` Bug — `daemon/lib/project-manager.mjs`

```javascript
// Replace lines 96-105 with:
async removeProject(projectId) {
  // FIRST: query the project to get root_path and services
  const row = this.db.prepare('SELECT root_path FROM projects WHERE id = ?').get(projectId);

  if (row) {
    // Stop watcher if running
    const instance = this.projects.get(row.root_path);
    if (instance?.watcher) {
      instance.watcher.stop();
    }
    // Clean up services
    this.projects.delete(row.root_path);
  }

  // THEN: delete from database
  this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

  return { deleted: true, rootPath: row?.root_path };
}
```

### 1.9 Cost Cap Enforcement — `daemon/lib/cost-tracker.mjs`

```javascript
// Add new method to CostTracker class:
async checkBudget(userId, estimatedCost) {
  const db = getDb();
  const user = db.prepare('SELECT monthly_cost_limit, daily_token_limit FROM users WHERE id = ?').get(userId);

  if (!user) return { allowed: true };

  // Check monthly cost
  const monthlySpend = await this.getMonthlySpend(userId);
  if (monthlySpend + estimatedCost > user.monthly_cost_limit) {
    return {
      allowed: false,
      reason: 'monthly_cost_limit',
      current: monthlySpend,
      limit: user.monthly_cost_limit,
      requested: estimatedCost
    };
  }

  // Check daily tokens
  const today = new Date().toISOString().slice(0, 10);
  const dailyTokens = db.prepare(
    'SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total FROM cost_logs WHERE user_id = ? AND created_at >= ?'
  ).get(userId, today);

  if (dailyTokens.total > user.daily_token_limit) {
    return {
      allowed: false,
      reason: 'daily_token_limit',
      current: dailyTokens.total,
      limit: user.daily_token_limit
    };
  }

  return { allowed: true };
}
```

**Integration point:** Call `checkBudget` in `chat-handler.mjs` before sending to LLM provider.

---

## 2. New Module Designs

### 2.1 Graceful Shutdown — `daemon/lib/shutdown.mjs`

```javascript
import { logger } from './logger.mjs';

let shutdownInProgress = false;
const cleanupFns = [];

export function registerCleanup(fn) {
  cleanupFns.push(fn);
}

export function setupGracefulShutdown(server, options = {}) {
  const drainTimeout = options.drainTimeout || 30000;

  const shutdown = async (signal) => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Run cleanup functions with timeout
    const cleanupPromise = Promise.all(cleanupFns.map((fn) => Promise.resolve().then(fn)));

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), drainTimeout);
    });

    try {
      await Promise.race([cleanupPromise, timeoutPromise]);
      logger.info('All cleanup completed');
    } catch (err) {
      logger.warn('Shutdown cleanup timed out or failed', { error: err.message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Integration point:** In `server.mjs`, call `setupGracefulShutdown(server)` and register cleanup for watchers, DB, job queue.

### 2.2 Backup System — `daemon/lib/backup.mjs`

```javascript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getDbPath, getDb } from '../db/connection.mjs';

const BACKUP_DIR = path.join(path.dirname(getDbPath()), 'backups');
const MAX_BACKUPS = 7; // Keep 7 daily backups

export async function createBackup() {
  const dbPath = getDbPath();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `nokta-${timestamp}.db`);

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  // Use SQLite backup API via VACUUM INTO
  const db = getDb();
  db.exec(`VACUUM INTO '${backupPath}'`);

  // Cleanup old backups
  const files = await fs.readdir(BACKUP_DIR);
  const dbFiles = files
    .filter((f) => f.startsWith('nokta-') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (const file of dbFiles.slice(MAX_BACKUPS)) {
    await fs.unlink(path.join(BACKUP_DIR, file)).catch(() => {});
  }

  return { path: backupPath, size: (await fs.stat(backupPath)).size };
}

export async function restoreBackup(backupPath) {
  const dbPath = getDbPath();

  // Verify backup integrity
  const { execSync } = await import('node:child_process');
  const result = execSync(`sqlite3 "${backupPath}" "PRAGMA integrity_check;"`, { encoding: 'utf8' });
  if (!result.trim().includes('ok')) {
    throw new Error(`Backup integrity check failed: ${result}`);
  }

  // Stop DB, replace, restart
  const { closeDb } = await import('../db/connection.mjs');
  closeDb();

  await fs.copyFile(backupPath, dbPath);

  // Restart DB
  const { getDb } = await import('../db/connection.mjs');
  getDb();

  return { restored: true, path: backupPath };
}

// Auto-backup every 24 hours
export function startAutoBackup() {
  setInterval(
    async () => {
      try {
        await createBackup();
        logger.info('Auto-backup completed');
      } catch (err) {
        logger.error('Auto-backup failed', { error: err.message });
      }
    },
    24 * 60 * 60 * 1000,
  ).unref();
}
```

### 2.3 Health Monitor — `daemon/lib/monitor.mjs`

```javascript
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { getDb } from '../db/connection.mjs';

export async function getHealthStatus() {
  const checks = {};

  // Database check
  try {
    const db = getDb();
    const start = Date.now();
    db.prepare('SELECT 1').get();
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
  }

  // Memory check
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const usedPercent = (mem.rss / totalMem) * 100;
  checks.memory = {
    status: usedPercent > 90 ? 'critical' : usedPercent > 80 ? 'warning' : 'ok',
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    usedPercent: Math.round(usedPercent * 100) / 100,
  };

  // Disk check
  try {
    const { size, available } = await fs.statfs(process.cwd());
    const usedPercent = ((size - available) / size) * 100;
    checks.disk = {
      status: usedPercent > 95 ? 'critical' : usedPercent > 85 ? 'warning' : 'ok',
      total: size,
      available,
      usedPercent: Math.round(usedPercent * 100) / 100,
    };
  } catch {
    checks.disk = { status: 'unknown' };
  }

  // Uptime
  checks.uptime = process.uptime();
  checks.timestamp = new Date().toISOString();

  const overallStatus = Object.values(checks).some((c) => c.status === 'critical')
    ? 'critical'
    : Object.values(checks).some((c) => c.status === 'warning')
      ? 'warning'
      : 'ok';

  return { status: overallStatus, checks };
}
```

### 2.4 Infinite Loop Protection — `daemon/lib/loop-guard.mjs`

```javascript
const runIterations = new Map(); // runId -> { count, lastRun, cooldownUntil }

const MAX_ITERATIONS = 10;
const COOLDOWN_MS = 300000; // 5 minutes

export function checkLoop(runId, triggerKey) {
  const key = `${runId}:${triggerKey}`;
  const now = Date.now();
  const record = runIterations.get(key);

  if (!record) {
    runIterations.set(key, { count: 1, lastRun: now, cooldownUntil: 0 });
    return { allowed: true };
  }

  // Check cooldown
  if (record.cooldownUntil > now) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfter: Math.ceil((record.cooldownUntil - now) / 1000),
    };
  }

  // Check iteration count
  if (record.count >= MAX_ITERATIONS) {
    record.cooldownUntil = now + COOLDOWN_MS;
    record.count = 0;
    return {
      allowed: false,
      reason: 'max_iterations',
      cooldownMs: COOLDOWN_MS,
    };
  }

  record.count++;
  record.lastRun = now;
  return { allowed: true };
}

export function resetLoop(runId, triggerKey) {
  runIterations.delete(`${runId}:${triggerKey}`);
}
```

**Integration point:** In `auto-watcher.mjs`, call `checkLoop` before triggering agent runs.

---

## 3. Data Layer Fixes

### 3.1 SprintEngine → DB Migration

**New tables (v3):**

```sql
CREATE TABLE IF NOT EXISTS sprint_items_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT,
  project_root TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('story', 'task', 'bug', 'subtask')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in-progress', 'review', 'done', 'cancelled')),
  sprint_id TEXT,
  epic_id TEXT,
  initiative_id TEXT,
  parent_id TEXT,
  auto_generated INTEGER NOT NULL DEFAULT 0,
  related_files TEXT DEFAULT '[]',
  evidence TEXT DEFAULT '',
  dependencies TEXT DEFAULT '[]',
  labels TEXT DEFAULT '[]',
  story_points INTEGER,
  assignee TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sprint_v2_user ON sprint_items_v2(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sprint_v2_project ON sprint_items_v2(project_root);
CREATE INDEX IF NOT EXISTS idx_sprint_v2_sprint ON sprint_items_v2(sprint_id);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT,
  project_root TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'review', 'closed')),
  velocity INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_root TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  initiative_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS initiatives (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_root TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  theme TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 CostTracker → DB Migration

**Changes to `cost-tracker.mjs`:**

```javascript
// Add DB writing alongside file writing
async record(model, inputTokens, outputTokens, metadata = {}) {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  const entry = {
    timestamp: new Date().toISOString(),
    model,
    provider: pricing.provider,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost,
    ...metadata,
  };

  // File-based (existing)
  this._ledger.entries.push(entry);
  this._ledger.totalCost += totalCost;
  this._ledger.totalTokens += entry.totalTokens;
  this._dirty = true;

  // DB-based (new)
  if (metadata.userId) {
    try {
      const { prepare } = await import('../db/connection.mjs');
      prepare(
        `INSERT INTO cost_logs (id, user_id, provider, model, tokens_in, tokens_out, cost, task)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        makeId('cost'),
        metadata.userId,
        pricing.provider,
        model,
        inputTokens,
        outputTokens,
        totalCost,
        metadata.task || null
      );
    } catch (err) {
      logger.error('Failed to write cost to DB', { error: err.message });
    }
  }

  return entry;
}
```

---

## 4. Input Validation — `daemon/lib/validator.mjs`

```javascript
import { z } from 'zod'; // Only if available, otherwise manual

// Manual validation (zero dependencies)
export function validate(schema, data) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
    }

    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength && String(value).length > rules.maxLength) {
      errors.push(`${field} must be at most ${rules.maxLength} characters`);
    }

    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push(`${field} format is invalid`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }

    if (rules.min !== undefined && Number(value) < rules.min) {
      errors.push(`${field} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && Number(value) > rules.max) {
      errors.push(`${field} must be at most ${rules.max}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Pre-defined schemas
export const schemas = {
  chat: {
    messages: { required: true, type: 'object' }, // Will check array separately
  },

  agentRun: {
    goal: { required: true, type: 'string', minLength: 1, maxLength: 10000 },
    trigger: { type: 'string', enum: ['manual', 'automatic', 'watcher', 'api'] },
  },

  sprintItem: {
    type: { required: true, type: 'string', enum: ['story', 'task', 'bug', 'subtask'] },
    title: { required: true, type: 'string', minLength: 1, maxLength: 500 },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'P4'] },
    status: { type: 'string', enum: ['backlog', 'ready', 'in-progress', 'review', 'done', 'cancelled'] },
  },

  project: {
    name: { required: true, type: 'string', minLength: 1, maxLength: 200 },
    rootPath: { required: true, type: 'string', minLength: 1 },
  },

  login: {
    email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 8 },
  },
};
```

---

## 5. Integration Blueprint

### 5.1 Server Startup Sequence

```javascript
// Updated server.mjs startup
import { setupGracefulShutdown, registerCleanup } from './lib/shutdown.mjs';
import { startAutoBackup } from './lib/backup.mjs';
import { loadBlacklist, startBlacklistCleanup } from './lib/token-blacklist.mjs';
import { getHealthStatus } from './lib/monitor.mjs';

export async function createServer(options = {}) {
  const app = express();

  // ... existing setup ...

  // Load token blacklist
  loadBlacklist();
  startBlacklistCleanup();

  // Register cleanup handlers
  registerCleanup(() => watcher.stop());
  registerCleanup(() => jobQueue.stop());
  registerCleanup(() => closeDb());

  // Setup graceful shutdown
  setupGracefulShutdown(app.listen(port));

  // Start auto-backup
  startAutoBackup();

  // Enhanced health endpoint
  app.get('/api/v1/health', async (req, res) => {
    const health = await getHealthStatus();
    const statusCode = health.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(health);
  });

  return { app, providerManager, chatHandler, port };
}
```

### 5.2 Request Flow (After Fixes)

```
IDE Request
  ↓
Auth Middleware
  ↓
Login Rate Limiter (if /auth/login)
  ↓
Input Validator (schema check)
  ↓
Rate Limiter (tier-aware)
  ↓
Budget Checker (cost cap enforcement)
  ↓
Chat Handler
  ↓
Gate Keeper (enhanced injection detection)
  ↓
Provider Router
  ↓
LLM API
  ↓
Response Filter (SecOps scan)
  ↓
Cost Logger (DB + file)
  ↓
IDE Response
```

### 5.3 File Dependency Graph

```
daemon/
├── server.mjs
│   ├── lib/shutdown.mjs (NEW)
│   ├── lib/backup.mjs (NEW)
│   ├── lib/monitor.mjs (NEW)
│   └── lib/token-blacklist.mjs (NEW)
├── lib/
│   ├── auth.mjs (MODIFIED)
│   │   └── lib/token-blacklist.mjs (NEW)
│   ├── cost-tracker.mjs (MODIFIED)
│   │   └── lib/atomic-write.mjs (NEW)
│   ├── project-manager.mjs (MODIFIED - bug fix)
│   ├── sprint-engine.mjs (MODIFIED - atomic writes)
│   │   └── lib/atomic-write.mjs (NEW)
│   ├── validator.mjs (NEW)
│   ├── login-rate-limit.mjs (NEW)
│   ├── loop-guard.mjs (NEW)
│   ├── safe-env.mjs (NEW)
│   └── path-guard.mjs (NEW)
├── agent/
│   ├── executor.mjs (MODIFIED - security fixes)
│   │   ├── lib/sandbox-exec.mjs (NEW)
│   │   └── lib/path-guard.mjs (NEW)
│   └── job-queue.mjs (MODIFIED - env isolation)
│       └── lib/safe-env.mjs (NEW)
└── db/
    └── schema.mjs (MODIFIED - v3 migration)
```

---

## 6. Migration Strategy

### Phase 0 Execution Order

1. Create `daemon/lib/atomic-write.mjs` (no dependencies)
2. Create `daemon/lib/safe-env.mjs` (no dependencies)
3. Create `daemon/lib/path-guard.mjs` (no dependencies)
4. Create `daemon/lib/sandbox-exec.mjs` (no dependencies)
5. Create `daemon/lib/token-blacklist.mjs` (depends on DB)
6. Create `daemon/lib/login-rate-limit.mjs` (no dependencies)
7. Create `daemon/lib/loop-guard.mjs` (no dependencies)
8. Create `daemon/lib/validator.mjs` (no dependencies)
9. Modify `daemon/lib/auth.mjs` (use token-blacklist, timingSafeEqual)
10. Modify `daemon/agent/executor.mjs` (use sandbox-exec, path-guard)
11. Modify `daemon/agent/job-queue.mjs` (use safe-env)
12. Modify `daemon/lib/cost-tracker.mjs` (use atomic-write, fix provider)
13. Modify `daemon/lib/sprint-engine.mjs` (use atomic-write)
14. Modify `daemon/lib/project-manager.mjs` (fix removeProject bug)
15. Modify `daemon/routes/auth.mjs` (add rate limiting, logout)
16. Modify `daemon/db/schema.mjs` (add v3 migration)
17. Create `daemon/lib/shutdown.mjs` (no dependencies)
18. Create `daemon/lib/backup.mjs` (depends on DB)
19. Create `daemon/lib/monitor.mjs` (depends on DB)
20. Modify `daemon/server.mjs` (integrate all new modules)

### Testing Strategy

Each fix should be tested in isolation:

1. Unit test for each new module
2. Integration test for each modified module
3. Security test for injection fixes
4. Load test for rate limiting
5. Chaos test for graceful shutdown
