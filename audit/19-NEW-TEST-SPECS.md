# New Test Specifications

**Generated**: 2026-09-28  
**Purpose**: Comprehensive test specs for all uncovered behaviors - don't trust existing tests

---

## Test Organization

```
tests/
├── auth/
│   ├── login-rate-limit.test.mjs      # NEW
│   ├── password-reset.test.mjs        # NEW
│   ├── jwt-rotation.test.mjs          # NEW
│   └── mfa.test.mjs                   # NEW (future)
├── agent-runs/
│   ├── pagination.test.mjs            # NEW
│   ├── sse-auth.test.mjs              # NEW
│   ├── concurrent-limit.test.mjs      # NEW
│   ├── worktree-cleanup.test.mjs      # NEW
│   └── dispatch-contract.test.mjs     # EXTEND
├── providers/
│   ├── circuit-breaker.test.mjs       # NEW
│   ├── failover.test.mjs              # NEW
├── database/
│   ├── cost-logs-archival.test.mjs    # NEW
│   ├── migration-rollback.test.mjs    # EXTEND
├── scope/
│   ├── fail-closed.test.mjs           # DONE (13 tests)
│   ├── overwrite-guard.test.mjs       # DONE (4 tests)
│   ├── syntax-check.test.mjs          # DONE (4 tests)
├── security/
│   ├── auth-bypass.test.mjs           # NEW
│   ├── sql-injection.test.mjs         # NEW
│   ├── path-traversal.test.mjs        # NEW
└── integration/
    ├── full-agent-run.test.mjs        # NEW
    ├── daemon-restart.test.mjs        # NEW
    └── cli-commands.test.mjs          # EXTEND
```

---

## Detailed Test Specs

### 1. Auth: Login Rate Limiting

**File**: `tests/auth/login-rate-limit.test.mjs`

```javascript
// Test: Login rate limiting blocks after 5 failed attempts
test('login rate limit blocks after 5 failures', async () => {
  const { loginRateLimit } = await import('../daemon/lib/login-rate-limit.mjs');
  const ip = '192.168.1.100';
  const email = 'attacker@evil.com';
  
  // 5 failed attempts should be allowed
  for (let i = 0; i < 5; i++) {
    const result = await loginRateLimit.check(ip, email);
    assert.equal(result.allowed, true);
  }
  
  // 6th attempt should be blocked
  const result = await loginRateLimit.check(ip, email);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /rate limit/i);
});

// Test: Successful login resets counter
test('successful login resets rate limit counter', async () => {
  const { loginRateLimit } = await import('../daemon/lib/login-rate-limit.mjs');
  const ip = '192.168.1.101';
  
  for (let i = 0; i < 5; i++) {
    await loginRateLimit.check(ip, 'user@test.com');
  }
  
  await loginRateLimit.recordSuccess(ip, 'user@test.com');
  
  // Should be allowed again
  const result = await loginRateLimit.check(ip, 'user@test.com');
  assert.equal(result.allowed, true);
});

// Test: Rate limit is per-IP+email combination
test('rate limit is per IP+email', async () => {
  const { loginRateLimit } = await import('../daemon/lib/login-rate-limit.mjs');
  
  // 5 failures for email1
  for (let i = 0; i < 5; i++) {
    await loginRateLimit.check('1.2.3.4', 'email1@test.com');
  }
  
  // email2 should still work from same IP
  const result = await loginRateLimit.check('1.2.3.4', 'email2@test.com');
  assert.equal(result.allowed, true);
});
```

### 2. Auth: Password Reset Flow

**File**: `tests/auth/password-reset.test.mjs`

```javascript
test('forgot password generates reset token', async () => {
  const { requestPasswordReset } = await import('../daemon/routes/auth.mjs');
  const email = 'user@test.com';
  
  const result = await requestPasswordReset(email);
  assert.equal(result.success, true);
  assert.ok(result.token);
  assert.ok(result.expiresAt > Date.now());
});

test('reset password with valid token updates hash', async () => {
  const { requestPasswordReset, resetPassword } = await import('../daemon/routes/auth.mjs');
  const email = 'user@test.com';
  const newPassword = 'NewPass123!';
  
  const { token } = await requestPasswordReset(email);
  const result = await resetPassword(token, newPassword);
  
  assert.equal(result.success, true);
  
  // Verify new password works
  const { verifyPassword } = await import('../daemon/lib/auth.mjs');
  const user = await getUserByEmail(email);
  assert.equal(await verifyPassword(newPassword, user.password_hash), true);
});

test('expired reset token rejected', async () => {
  const { resetPassword } = await import('../daemon/routes/auth.mjs');
  
  // Create expired token manually
  const expiredToken = createExpiredToken();
  const result = await resetPassword(expiredToken, 'NewPass123!');
  
  assert.equal(result.success, false);
  assert.match(result.error, /expired/i);
});

test('used reset token cannot be reused', async () => {
  const { requestPasswordReset, resetPassword } = await import('../daemon/routes/auth.mjs');
  
  const { token } = await requestPasswordReset('user@test.com');
  await resetPassword(token, 'NewPass123!');
  
  // Second use should fail
  const result = await resetPassword(token, 'AnotherPass123!');
  assert.equal(result.success, false);
  assert.match(result.error, /already used|invalid/i);
});
```

### 3. Auth: JWT Key Rotation

**File**: `tests/auth/jwt-rotation.test.mjs`

```javascript
test('new tokens signed with new key after rotation', async () => {
  const { createToken, verifyToken, rotateKeys, getKey } = await import('../daemon/lib/auth.mjs');
  
  const payload = { sub: 'user123', role: 'user' };
  const token1 = await createToken(payload);
  const keyId1 = getKeyId(token1);
  
  await rotateKeys();
  
  const token2 = await createToken(payload);
  const keyId2 = getKeyId(token2);
  
  assert.notEqual(keyId1, keyId2);
  
  // Both tokens should verify
  assert.ok(verifyToken(token1));
  assert.ok(verifyToken(token2));
});

test('old keys still valid for verification after rotation', async () => {
  const { createToken, verifyToken, rotateKeys } = await import('../daemon/lib/auth.mjs');
  
  const token = await createToken({ sub: 'user123' });
  await rotateKeys();
  await rotateKeys(); // Two rotations
  
  // Original token should still verify
  assert.ok(verifyToken(token));
});

test('revoked key cannot sign new tokens', async () => {
  const { createToken, revokeKey } = await import('../daemon/lib/auth.mjs');
  
  const keyId = getCurrentKeyId();
  await revokeKey(keyId);
  
  await assert.rejects(
    () => createToken({ sub: 'user123' }),
    /key revoked|no valid key/i
  );
});
```

### 4. Agent Runs: Pagination

**File**: `tests/agent-runs/pagination.test.mjs`

```javascript
test('list runs supports page and limit params', async () => {
  const { listRuns } = await import('../daemon/routes/agent-runs.mjs');
  
  // Create 25 test runs
  for (let i = 0; i < 25; i++) {
    await createTestRun({ goal: `Test run ${i}` });
  }
  
  // Page 1, limit 10
  const page1 = await listRuns({ page: 1, limit: 10 });
  assert.equal(page1.runs.length, 10);
  assert.equal(page1.page, 1);
  assert.equal(page1.limit, 10);
  assert.equal(page1.total, 25);
  assert.equal(page1.totalPages, 3);
  
  // Page 2
  const page2 = await listRuns({ page: 2, limit: 10 });
  assert.equal(page2.runs.length, 10);
  assert.equal(page2.page, 2);
  
  // Page 3 (last page)
  const page3 = await listRuns({ page: 3, limit: 10 });
  assert.equal(page3.runs.length, 5);
});

test('default pagination returns first 20', async () => {
  const { listRuns } = await import('../daemon/routes/agent-runs.mjs');
  
  for (let i = 0; i < 25; i++) {
    await createTestRun({ goal: `Test ${i}` });
  }
  
  const result = await listRuns({});
  assert.equal(result.runs.length, 20);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
});

test('invalid page/limit returns 400', async () => {
  const { listRuns } = await import('../daemon/routes/agent-runs.mjs');
  
  await assert.rejects(
    () => listRuns({ page: 0 }),
    /page must be >= 1/
  );
  
  await assert.rejects(
    () => listRuns({ limit: 101 }),
    /limit must be <= 100/
  );
});
```

### 5. Agent Runs: SSE Authentication

**File**: `tests/agent-runs/sse-auth.test.mjs`

```javascript
test('SSE accepts token via query param', async () => {
  const token = await createTestToken();
  const runId = await createTestRun({ goal: 'SSE test' });
  
  const response = await fetch(`http://localhost:4217/api/v1/agent-runs/events?token=${token}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
});

test('SSE rejects without token', async () => {
  const response = await fetch('http://localhost:4217/api/v1/agent-runs/events');
  assert.equal(response.status, 401);
});

test('SSE rejects expired token', async () => {
  const expiredToken = createExpiredToken();
  const response = await fetch(`http://localhost:4217/api/v1/agent-runs/events?token=${expiredToken}`);
  assert.equal(response.status, 401);
});

test('SSE streams events for user runs only', async () => {
  const token1 = await createTestToken('user1');
  const token2 = await createTestToken('user2');
  
  const runId = await createTestRun({ goal: 'User 1 run', userId: 'user1' });
  
  const events1 = await collectSSEEvents(`http://localhost:4217/api/v1/agent-runs/events?token=${token1}`, 5000);
  const events2 = await collectSSEEvents(`http://localhost:4217/api/v1/agent-runs/events?token=${token2}`, 5000);
  
  // User1 should see their run events
  assert.ok(events1.some(e => e.data.includes(runId)));
  // User2 should NOT see user1's run events
  assert.ok(!events2.some(e => e.data.includes(runId)));
});
```

### 6. Agent Runs: Concurrent Limit

**File**: `tests/agent-runs/concurrent-limit.test.mjs`

```javascript
test('concurrent run limit enforced per user', async () => {
  const { runLimit } = await import('../daemon/lib/run-limit.mjs');
  const userId = 'user-limit-test';
  
  // Set limit to 2
  await runLimit.setLimit(userId, 2);
  
  // First two should succeed
  assert.equal(await runLimit.check(userId), { allowed: true, current: 0 });
  await runLimit.increment(userId);
  assert.equal(await runLimit.check(userId), { allowed: true, current: 1 });
  await runLimit.increment(userId);
  
  // Third should be rejected
  assert.equal(await runLimit.check(userId), { allowed: false, current: 2, reason: 'limit exceeded' });
});

test('run limit decrements on completion', async () => {
  const { runLimit } = await import('../daemon/lib/run-limit.mjs');
  const userId = 'user-limit-test-2';
  
  await runLimit.setLimit(userId, 1);
  await runLimit.increment(userId);
  assert.equal(await runLimit.check(userId), { allowed: false, current: 1 });
  
  await runLimit.decrement(userId);
  assert.equal(await runLimit.check(userId), { allowed: true, current: 0 });
});
```

### 7. Agent Runs: Worktree Cleanup on Crash

**File**: `tests/agent-runs/worktree-cleanup.test.mjs`

```javascript
test('worktree cleaned up when run crashes', async () => {
  const { createRunWorktree, removeRunWorktree, listRunWorktrees } = await import('../daemon/agent/worktree.mjs');
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-wt-'));
  
  try {
    const runId = 'test-crash-cleanup';
    const { worktreePath, branch } = await createRunWorktree({ projectRoot, runId });
    
    // Verify worktree exists
    const worktreesBefore = await listRunWorktrees(projectRoot);
    assert.ok(worktreesBefore.some(w => w.runId === runId));
    
    // Simulate crash - remove worktree
    await removeRunWorktree({ projectRoot, worktreePath, branch });
    
    // Verify worktree removed
    const worktreesAfter = await listRunWorktrees(projectRoot);
    assert.ok(!worktreesAfter.some(w => w.runId === runId));
    
    // Verify branch deleted
    const branches = await execGit(projectRoot, 'branch', '--list', branch);
    assert.equal(branches.trim(), '');
    
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('orphaned worktrees cleaned on daemon start', async () => {
  // Create orphaned worktree manually
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-orphan-'));
  
  try {
    await execGit(projectRoot, 'worktree', 'add', '.nokta/worktrees/orphan-run', 'nokta/orphan-run');
    
    // Start daemon (which should clean orphaned)
    const { cleanupOrphanedWorktrees } = await import('../daemon/agent/worktree.mjs');
    await cleanupOrphanedWorktrees(projectRoot);
    
    // Verify cleaned
    const worktrees = await listRunWorktrees(projectRoot);
    assert.ok(!worktrees.some(w => w.runId === 'orphan-run'));
    
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
```

### 8. Providers: Circuit Breaker

**File**: `tests/providers/circuit-breaker.test.mjs`

```javascript
test('circuit breaker opens after 5 consecutive failures', async () => {
  const { ProviderManager } = await import('../daemon/lib/provider-manager.mjs');
  const manager = new ProviderManager({ log: silentLogger });
  
  // Register failing provider
  manager.register('failing', new FailingProvider());
  
  // 5 failures should open circuit
  for (let i = 0; i < 5; i++) {
    try { await manager.call('failing', 'complete', {}); } catch {}
  }
  
  const status = manager.getCircuitStatus('failing');
  assert.equal(status.state, 'open');
});

test('circuit breaker half-open after timeout', async () => {
  const { ProviderManager } = await import('../daemon/lib/provider-manager.mjs');
  const manager = new ProviderManager({ log: silentLogger, circuitBreakerTimeout: 100 });
  
  manager.register('failing', new FailingProvider());
  
  // Open circuit
  for (let i = 0; i < 5; i++) {
    try { await manager.call('failing', 'complete', {}); } catch {}
  }
  assert.equal(manager.getCircuitStatus('failing').state, 'open');
  
  // Wait for timeout
  await new Promise(r => setTimeout(r, 150));
  
  // Next call should be half-open (allowed through)
  const status = manager.getCircuitStatus('failing');
  assert.equal(status.state, 'half-open');
});

test('successful call in half-open closes circuit', async () => {
  const { ProviderManager } = await import('../daemon/lib/provider-manager.mjs');
  const manager = new ProviderManager({ log: silentLogger, circuitBreakerTimeout: 100 });
  
  let fail = true;
  manager.register('flaky', {
    async complete() { 
      if (fail) throw new Error('fail');
      return { content: 'ok' };
    }
  });
  
  // Open circuit
  for (let i = 0; i < 5; i++) {
    try { await manager.call('flaky', 'complete', {}); } catch {}
  }
  assert.equal(manager.getCircuitStatus('flaky').state, 'open');
  
  // Wait for half-open
  await new Promise(r => setTimeout(r, 150));
  
  // Make provider succeed
  fail = false;
  await manager.call('flaky', 'complete', {});
  
  // Circuit should close
  assert.equal(manager.getCircuitStatus('flaky').state, 'closed');
});
```

### 9. Providers: Failover

**File**: `tests/providers/failover.test.mjs`

```javascript
test('failover to healthy provider when primary fails', async () => {
  const { ProviderManager } = await import('../daemon/lib/provider-manager.mjs');
  const manager = new ProviderManager({ log: silentLogger, autoRoute: true });
  
  const failing = new FailingProvider();
  const working = new WorkingProvider();
  
  manager.register('primary', failing, { priority: 1 });
  manager.register('backup', working, { priority: 2 });
  
  // Call should failover to backup
  const result = await manager.complete({ prompt: 'test' });
  assert.equal(result.content, 'ok from backup');
  assert.equal(result.provider, 'backup');
});

test('failover respects priority order', async () => {
  const { ProviderManager } = await import('../daemon/lib/provider-manager.mjs');
  const manager = new ProviderManager({ log: silentLogger, autoRoute: true });
  
  const p1 = new FailingProvider();
  const p2 = new FailingProvider();
  const p3 = new WorkingProvider();
  
  manager.register('low', p1, { priority: 3 });
  manager.register('med', p2, { priority: 2 });
  manager.register('high', p3, { priority: 1 });
  
  const result = await manager.complete({ prompt: 'test' });
  assert.equal(result.provider, 'high');
});
```

### 10. Database: Cost Logs Archival

**File**: `tests/database/cost-logs-archival.test.mjs`

```javascript
test('cost logs older than 90 days moved to archive', async () => {
  const { CostTracker } = await import('../daemon/lib/cost-tracker.mjs');
  const tracker = new CostTracker();
  
  // Insert old cost logs
  const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 10; i++) {
    await tracker.logCost({ userId: 'u1', provider: 'openai', cost: 0.01, createdAt: oldDate });
  }
  
  // Insert recent cost logs
  for (let i = 0; i < 5; i++) {
    await tracker.logCost({ userId: 'u1', provider: 'openai', cost: 0.01 });
  }
  
  await tracker.archiveOldLogs(90); // Archive > 90 days
  
  // Verify old logs archived (moved to cost_logs_archive table)
  const archived = db.prepare('SELECT COUNT(*) as c FROM cost_logs_archive WHERE user_id = ?').get('u1');
  assert.equal(archived.c, 10);
  
  // Verify recent logs remain
  const recent = db.prepare('SELECT COUNT(*) as c FROM cost_logs WHERE user_id = ?').get('u1');
  assert.equal(recent.c, 5);
});
```

### 11. Integration: Full Agent Run

**File**: `tests/integration/full-agent-run.test.mjs`

```javascript
test('complete agent run lifecycle: create -> dispatch -> execute -> complete', async () => {
  const { AgentOrchestrator } = await import('../daemon/agent/orchestrator.mjs');
  const { AgentJobQueue } = await import('../daemon/agent/job-queue.mjs');
  const { SprintEngine } = await import('../daemon/lib/sprint-engine.mjs');
  
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-int-'));
  const log = silentLogger;
  
  try {
    const sprintEngine = new SprintEngine(projectRoot, { log });
    const orchestrator = new AgentOrchestrator(projectRoot, { log, sprintEngine });
    const jobQueue = new AgentJobQueue({ concurrency: 1, log });
    jobQueue.start();
    
    // Create run
    const run = await orchestrator.createRun({
      userId: 'test-user',
      goal: 'Add health endpoint to server.mjs',
      trigger: 'manual',
    });
    
    assert.equal(run.status, 'created');
    
    // Dispatch (enqueue)
    await jobQueue.enqueue(run.id, { projectRoot });
    
    // Wait for completion
    const completedRun = await waitForRunCompletion(orchestrator, run.id, 60000);
    
    assert.equal(completedRun.status, 'completed');
    assert.ok(completedRun.output.length > 0);
    
    // Verify edit step created file
    const editStep = completedRun.output.find(s => s.type === 'edit');
    assert.ok(editStep);
    assert.equal(editStep.status, 'completed');
    
    // Verify file exists in worktree (or main if no isolation)
    const worktreePath = completedRun.metadata?.worktree?.path;
    if (worktreePath) {
      const healthFile = path.join(worktreePath, 'daemon', 'server.mjs');
      const content = await fs.readFile(healthFile, 'utf8');
      assert.match(content, /health/);
    }
    
  } finally {
    jobQueue.stop();
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
```

### 12. Integration: Daemon Restart Recovery

**File**: `tests/integration/daemon-restart.test.mjs`

```javascript
test('queued runs resume after daemon restart', async () => {
  const { AgentOrchestrator } = await import('../daemon/agent/orchestrator.mjs');
  const { AgentJobQueue } = await import('../daemon/agent/job-queue.mjs');
  
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-restart-'));
  
  try {
    const orchestrator = new AgentOrchestrator(projectRoot, { log: silentLogger });
    const jobQueue = new AgentJobQueue({ concurrency: 1, log: silentLogger });
    jobQueue.start();
    
    // Create and enqueue run
    const run = await orchestrator.createRun({
      userId: 'test-user',
      goal: 'Test restart recovery',
    });
    await jobQueue.enqueue(run.id, { projectRoot });
    
    // Simulate daemon restart - stop queue
    jobQueue.stop();
    
    // Create new queue (simulating restart)
    const jobQueue2 = new AgentJobQueue({ concurrency: 1, log: silentLogger });
    jobQueue2.start();
    
    // Run should still be in 'queued' status
    const runAfter = await orchestrator.getRun(run.id);
    assert.equal(runAfter.status, 'queued');
    
    // Re-enqueue should work
    await jobQueue2.enqueue(run.id, { projectRoot });
    
    // Wait for completion
    const completed = await waitForRunCompletion(orchestrator, run.id, 30000);
    assert.equal(completed.status, 'completed');
    
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
```

---

## Test Utilities Needed

```javascript
// tests/test-utils.mjs
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';

export async function createTempDir(prefix = 'nokta-test-') {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanupTempDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

export function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

export async function createTestUser(db, email = 'test@test.com') {
  const { hashPassword } = await import('../daemon/lib/auth.mjs');
  const passwordHash = await hashPassword('Test123!');
  const id = 'usr_' + crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)').run(id, email, passwordHash);
  return { id, email };
}

export async function createTestToken(userId) {
  const { createToken } = await import('../daemon/lib/auth.mjs');
  return createToken({ sub: userId, role: 'user' });
}

export async function createTestRun(orchestrator, options = {}) {
  return orchestrator.createRun({
    userId: options.userId || 'test-user',
    goal: options.goal || 'Test goal',
    trigger: 'manual',
  });
}

export function waitForRunCompletion(orchestrator, runId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      const run = await orchestrator.getRun(runId);
      if (run.status === 'completed' || run.status === 'failed') {
        resolve(run);
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for run completion'));
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

export async function collectSSEEvents(url, durationMs) {
  const events = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), durationMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          events.push(JSON.parse(line.slice(6)));
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  } finally {
    clearTimeout(timeout);
  }
  
  return events;
}
```

---

## Test Execution Order

```bash
# Run in dependency order
npm test  # Runs all

# Or run specific categories
node --test tests/auth/login-rate-limit.test.mjs
node --test tests/agent-runs/pagination.test.mjs
node --test tests/providers/circuit-breaker.test.mjs
node --test tests/integration/full-agent-run.test.mjs
```

---

## Coverage Targets

| Area | Target Coverage | Current |
|------|----------------|---------|
| Auth routes | 100% | ~60% |
| Agent runs routes | 100% | ~80% |
| Provider manager | 90% | ~40% |
| Database operations | 90% | ~50% |
| Scope enforcement | 100% | ✅ 100% |
| Orchestrator | 80% | ~60% |
| Job queue/worker | 80% | ~50% |
| CLI commands | 70% | ~50% |

---

## Anti-Patterns to Avoid

1. **Don't mock the database** - Use real SQLite in temp directory
2. **Don't mock time** - Use real timers, accept flakiness
3. **Don't test implementation details** - Test behavior/contracts
4. **Don't share state between tests** - Each test gets fresh temp dir
5. **Don't skip cleanup** - Always cleanup in `finally` block