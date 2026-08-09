# Implementation Plan: Phase 0.5/0.7 + Trust Architecture

## Execution Order

Everything is sequential. No task begins until its dependencies are complete.

---

## PART A: Phase 0.5 — P1 Security Hardening

### A1. Token Blacklist + Session Revocation

**New file:** `daemon/lib/token-blacklist.mjs`

- `blacklistToken(jti, expiresAt)` — store in-memory LRU Map + DB
- `isBlacklisted(jti)` — check Map first, fallback to DB
- `loadBlacklist()` — populate Map from DB on startup
- `startBlacklistCleanup()` — setInterval every 60s, evict expired

**Modify:** `daemon/lib/auth.mjs`

- `createToken()` — add `jti: randomBytes(16).toString('hex')` to payload
- `verifyToken()` — call `isBlacklisted(token)` before signature check
- Add `blacklistCurrentToken(req)` export for logout endpoint

**Modify:** `daemon/routes/auth.mjs`

- Add `POST /api/v1/auth/logout` — calls `blacklistCurrentToken(req)`, returns `{ success: true }`
- Add login rate limiting via `checkLoginRateLimit(ip)`

**New file:** `daemon/lib/login-rate-limit.mjs`

- `checkLoginRateLimit(ip)` — Map-based, 5 attempts per 60s window
- Cleanup every 5 minutes

**DB migration v3:** Add `token_blacklist` table

### A2. Graceful Shutdown

**New file:** `daemon/lib/shutdown.mjs`

- `registerCleanup(fn)` — register cleanup callbacks
- `setupGracefulShutdown(server, { drainTimeout })` — SIGTERM/SIGINT handlers, drain connections, run cleanups with timeout

**Modify:** `daemon/server.mjs`

- Import and call `setupGracefulShutdown()` after `app.listen()`
- Register cleanup for: watcher.stop(), jobQueue.stop(), closeDb()

### A3. CORS Restriction

**Modify:** `daemon/server.mjs`

- Change `cors({ origin: options.corsOrigin || '*' })` to use a whitelist function
- If `NOKTA_CORS_ORIGIN` is set, split by comma and validate against it
- Default: allow localhost origins only (no wildcard)

### A4. Database Backup Mechanism

**New file:** `daemon/lib/backup.mjs`

- `createBackup()` — VACUUM INTO with timestamp filename
- `restoreBackup(path)` — integrity check + file copy
- `startAutoBackup()` — setInterval every 24h
- `listBackups()` — list available backups
- Keep max 7 backups

**Modify:** `daemon/server.mjs`

- Call `startAutoBackup()` on startup

### A5. Max Concurrent Runs Per User

**Modify:** `daemon/lib/cost-tracker.mjs` or create `daemon/lib/run-limit.mjs`

- `canStartRun(userId)` — check active runs count from DB (limit: 5)
- `recordRunStart(userId, runId)` / `recordRunEnd(userId, runId)`

**Modify:** `daemon/routes/agent-runs.mjs`

- Check `canStartRun(userId)` before creating/executing runs

### A6. JWT Secret Auto-Rotation

**Modify:** `daemon/lib/auth.mjs`

- `getSecret()` — store creation timestamp in `.jwt-secret.meta`
- If age > 90 days, generate new secret, keep old secret for verification during grace period
- `getVerificationSecrets()` — return array of [current, ...grace] secrets

### A7. Session Cleanup Cron

**Modify:** `daemon/server.mjs` or create `daemon/lib/session-cleanup.mjs`

- `startSessionCleanup()` — setInterval every 1h, delete expired sessions from DB
- Register as cleanup in shutdown

### A8. DOWN Migrations + Transaction Wrapping

**Modify:** `daemon/db/schema.mjs`

- Add `downgrade(version)` function that drops/recreates tables
- Wrap each migration in `db.exec('BEGIN TRANSACTION; ... COMMIT;')`
- Add `MIGRATIONS_DOWN` array with DROP statements

### A9. Request ID Propagation (moved from 0.7 — needed for observability)

**New file:** `daemon/lib/request-id.mjs`

- Middleware that adds `X-Request-Id` header (UUID or `req.id`)
- Propagate to all `log.info()` calls via child logger

**Modify:** `daemon/server.mjs`

- Add `requestIdMiddleware()` before other middleware

### A10. Enhanced Health Check

**New file:** `daemon/lib/monitor.mjs`

- `getHealthStatus()` — checks: DB latency, memory usage, disk usage, uptime
- Returns `{ status: 'ok'|'warning'|'critical', checks: {...} }`

**Modify:** `daemon/routes/health.mjs`

- Replace inline health with `getHealthStatus()` call
- Return 503 if critical

---

## PART B: Phase 0.7 — P2 Security Hardening

### B1. Configurable Model Pricing

**Modify:** `daemon/lib/cost-tracker.mjs`

- `MODEL_PRICING` loaded from DB `model_pricing` table or config file
- `updatePricing(model, input, output, provider)` — upsert pricing
- `listPricing()` — merge hardcoded defaults with DB overrides

**DB migration v3:** Add `model_pricing` table (model, input, output, provider, updated_at)

### B2. Structured Logging

**Modify:** `daemon/lib/logger.mjs`

- Add JSON lines format option (`NOKTA_LOG_FORMAT=json`)
- Include: timestamp, level, service, requestId, message, metadata
- Keep human-readable as default

### B3. Cost Prediction

**Modify:** `daemon/lib/cost-tracker.mjs`

- `predictMonthlyCost(userId)` — linear regression on last 30 days of daily costs
- Return `{ predicted, confidence, trend: 'increasing'|'stable'|'decreasing' }`

### B4. Input Validation

**New file:** `daemon/lib/validator.mjs`

- `validate(schema, data)` — manual validation (no deps)
- Pre-defined schemas: login, register, agentRun, sprintItem, project, chat
- Return `{ valid, errors }`

**Modify:** `daemon/routes/auth.mjs`, `daemon/routes/agent-runs.mjs`, `daemon/routes/planner.mjs`

- Add `validate()` calls at start of each handler

### B5. .env File Support

**New file:** `daemon/lib/dotenv.mjs`

- Parse `.env` file from project root
- Only set env vars that aren't already set
- Support comments, quotes, multi-line

**Modify:** `daemon/index.mjs`

- Call `loadDotenv()` at startup before config loading

### B6. Config Validation

**Modify:** `daemon/lib/config.mjs`

- Validate port is number, host is string, logLevel is valid
- Validate provider configs have required fields
- Throw descriptive errors on bad config

---

## PART C: Trust Architecture (8 Features)

### C1. Scope Enforcement Engine

**New file:** `daemon/lib/scope-enforcer.mjs`

- `declareScope(runId, scope)` — register allowed/blocked files, dirs, limits
- `validateMutation(runId, { file, operation, linesChanged })` — check against scope
- `recordMutation(runId, mutation)` — track mutations
- `getScopeReport(runId)` — violations, files changed, limits status
- `matchesPattern(file, glob)` — simple glob matching

**Modify:** `daemon/agent/executor.mjs`

- Add `scope` step type to `executeStep()`
- Wrap `edit` steps with `scopeEnforcer.validateMutation()`

**DB migration v3:** Add `scope_declarations` table (run_id, scope_json, created_at)

### C2. Production Readiness Gate

**New file:** `daemon/lib/production-gate.mjs`

- `PRODUCTION_CHECKS` array — 8 categories: error-handling, input-validation, timeout, retry-logic, resource-cleanup, concurrency, logging, graceful-degradation
- `analyze(diff, context)` — parse diff, run checks per file
- `calculateScore(results)` — weighted scoring (HIGH=10, MEDIUM=5, LOW=1)
- `generateSummary(results)` — human-readable summary

**Modify:** `daemon/agent/executor.mjs`

- After `review` step, run `ProductionGate.analyze(diff)`
- Before `pr` step, check gate score; block if critical failures

### C3. Context Persistence Layer

**New file:** `daemon/lib/context-memory.mjs`

- `initSchema()` — create `context_memory` table
- `storeDecision(userId, projectRoot, decision)` — key/value with metadata
- `storeFileContext(userId, projectRoot, filePath, context)` — file summaries
- `storePattern(userId, projectRoot, pattern)` — recurring patterns
- `storeError(userId, projectRoot, error)` — error + fix pairs
- `query(userId, projectRoot, { type, key, limit, minConfidence })` — search
- `compileFileContext(userId, projectRoot, filePath)` — aggregate context
- `decay(maxAgeDays)` — reduce confidence over time

**DB migration v3:** Add `context_memory` table (id, user_id, project_root, type, key, value, metadata, confidence, access_count, timestamps)

### C4. Test Impact Analysis

**New file:** `daemon/lib/test-impact.mjs`

- `buildDependencyMap()` — scan all imports in project
- `scanFile(filePath)` — extract import/require statements
- `resolveImport(importPath, fromFile)` — resolve with extensions
- `analyzeImpact(changedFiles)` — find affected tests
- `generateTestCommand(impact)` — generate test runner command

### C5. Decision Trail

**New file:** `daemon/lib/decision-trail.mjs`

- `initSchema()` — create `decision_trail` table
- `record(runId, userId, projectRoot, decision)` — store decision with reasoning
- `updateOutcome(trailId, outcome)` — update with success/failure
- `getTrail(runId)` — full trail for a run
- `getProjectTrailSummary(projectRoot)` — aggregated stats
- `getFileDecisions(filePath)` — recent decisions for a file
- `explainChange(filePath, changeContent)` — find why a change was made

**DB migration v3:** Add `decision_trail` table

### C6. Smart Diff Summaries

**New file:** `daemon/lib/diff-summarizer.mjs`

- `summarize(diff, context)` — call LLM to generate review summary
- `parseSummary(content)` — extract structured sections
- `generateFallbackSummary(diff)` — line-count based fallback
- `formatForPR(summary)` — format as GitHub PR body markdown

**Modify:** `daemon/agent/executor.mjs`

- After `review` step, generate diff summary
- Include summary in run output

### C7. Multi-Project Context Bridge

**New file:** `daemon/lib/cross-project-bridge.mjs`

- `initSchema()` — create `shared_patterns` + `project_relationships` tables
- `recordPatternUsage(userId, projectRoot, patternName, desc, code, category)` — track patterns
- `getRelevantPatterns(userId, currentProject, category)` — patterns from other projects
- `detectRelationships(userId, projectA, projectB)` — shared deps/patterns
- `getRecommendations(userId, currentProject)` — cross-project suggestions

**DB migration v3:** Add `shared_patterns` + `project_relationships` tables

### C8. Developer Trust Dashboard

**New file:** `daemon/lib/trust-dashboard.mjs`

- `getTrustMetrics(userId, projectRoot)` — acceptance rate, confidence, error rate, cost, scope compliance, composite trust score
- `getActivityTimeline(userId, projectRoot, limit)` — recent runs with cost
- `getCostBreakdown(userId, days)` — by provider/model
- `getRiskAssessment(userId, projectRoot)` — cost risks, reliability risks

**New route:** `daemon/routes/trust.mjs`

- `GET /api/v1/trust/metrics` — trust metrics
- `GET /api/v1/trust/timeline` — activity timeline
- `GET /api/v1/trust/costs` — cost breakdown
- `GET /api/v1/trust/risks` — risk assessment

**Modify:** `daemon/server.mjs`

- Register trust routes

---

## DB Migration v3 — All New Tables

```sql
-- Token blacklisting
CREATE TABLE IF NOT EXISTS token_blacklist (
  token_id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

-- Model pricing overrides
CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input REAL NOT NULL,
  output REAL NOT NULL,
  provider TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scope enforcement
CREATE TABLE IF NOT EXISTS scope_declarations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Context persistence
CREATE TABLE IF NOT EXISTS context_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_root TEXT NOT NULL,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  confidence REAL DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_context_user ON context_memory(user_id, project_root, type);
CREATE INDEX IF NOT EXISTS idx_context_key ON context_memory(key);

-- Decision trail
CREATE TABLE IF NOT EXISTS decision_trail (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_root TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  action TEXT NOT NULL,
  file_path TEXT,
  reasoning TEXT NOT NULL,
  alternatives_considered TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0.8,
  outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trail_run ON decision_trail(run_id);
CREATE INDEX IF NOT EXISTS idx_trail_user ON decision_trail(user_id, project_root);

-- Cross-project patterns
CREATE TABLE IF NOT EXISTS shared_patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,
  code_example TEXT,
  category TEXT NOT NULL,
  projects_used TEXT NOT NULL DEFAULT '[]',
  confidence REAL DEFAULT 0.8,
  usage_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patterns_user ON shared_patterns(user_id, category);

-- Project relationships
CREATE TABLE IF NOT EXISTS project_relationships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_a TEXT NOT NULL,
  project_b TEXT NOT NULL,
  relationship TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relationships_projects ON project_relationships(project_a, project_b);
```

---

## File Dependency Graph

```
New modules (no deps):
  daemon/lib/token-blacklist.mjs
  daemon/lib/login-rate-limit.mjs
  daemon/lib/shutdown.mjs
  daemon/lib/backup.mjs
  daemon/lib/monitor.mjs
  daemon/lib/request-id.mjs
  daemon/lib/dotenv.mjs
  daemon/lib/validator.mjs
  daemon/lib/scope-enforcer.mjs
  daemon/lib/production-gate.mjs
  daemon/lib/context-memory.mjs
  daemon/lib/test-impact.mjs
  daemon/lib/decision-trail.mjs
  daemon/lib/diff-summarizer.mjs
  daemon/lib/cross-project-bridge.mjs
  daemon/lib/trust-dashboard.mjs

New routes:
  daemon/routes/trust.mjs

Modified files:
  daemon/lib/auth.mjs (jti, blacklist, rotation)
  daemon/lib/cost-tracker.mjs (configurable pricing, prediction)
  daemon/lib/logger.mjs (structured logging)
  daemon/lib/config.mjs (validation)
  daemon/db/schema.mjs (v3 migration)
  daemon/server.mjs (shutdown, backup, cors, health, trust routes)
  daemon/routes/auth.mjs (logout, rate limit)
  daemon/routes/agent-runs.mjs (run limit)
  daemon/routes/health.mjs (enhanced health)
  daemon/agent/executor.mjs (scope, production gate)
```

---

## Execution Sequence

| Step | Module                                                        | Depends On |
| ---- | ------------------------------------------------------------- | ---------- |
| 1    | DB migration v3 (schema.mjs)                                  | —          |
| 2    | token-blacklist.mjs                                           | —          |
| 3    | login-rate-limit.mjs                                          | —          |
| 4    | Modify auth.mjs (jti + blacklist)                             | 2          |
| 5    | Modify routes/auth.mjs (logout + rate limit)                  | 2, 3       |
| 6    | shutdown.mjs                                                  | —          |
| 7    | backup.mjs                                                    | —          |
| 8    | monitor.mjs                                                   | —          |
| 9    | request-id.mjs                                                | —          |
| 10   | Modify server.mjs (shutdown, backup, cors, health, requestId) | 6, 7, 8, 9 |
| 11   | dotenv.mjs                                                    | —          |
| 12   | validator.mjs                                                 | —          |
| 13   | Modify config.mjs (validation)                                | —          |
| 14   | Modify index.mjs (dotenv)                                     | 11         |
| 15   | run-limit.mjs                                                 | —          |
| 16   | Modify agent-runs.mjs (run limit)                             | 15         |
| 17   | Modify cost-tracker.mjs (configurable pricing)                | —          |
| 18   | Modify logger.mjs (structured logging)                        | —          |
| 19   | scope-enforcer.mjs                                            | —          |
| 20   | production-gate.mjs                                           | —          |
| 21   | context-memory.mjs                                            | —          |
| 22   | test-impact.mjs                                               | —          |
| 23   | decision-trail.mjs                                            | —          |
| 24   | diff-summarizer.mjs                                           | —          |
| 25   | cross-project-bridge.mjs                                      | —          |
| 26   | trust-dashboard.mjs                                           | —          |
| 27   | trust.mjs (routes)                                            | 26         |
| 28   | Modify executor.mjs (scope + production gate)                 | 19, 20     |
| 29   | Modify server.mjs (trust routes)                              | 27         |
| 30   | Tests for all new modules                                     | all        |
