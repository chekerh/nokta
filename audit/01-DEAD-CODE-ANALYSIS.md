# Dead Code Analysis Report - FINAL

**Generated**: 2026-09-28  
**Method**: Static import graph traversal + runtime verification + CLI entry point analysis

---

## Summary of Changes

### Files Deleted (12)

| File | Reason | Verified |
|------|--------|----------|
| `daemon/lib/context-memory.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/cross-project-bridge.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/decision-trail.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/diff-summarizer.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/login-rate-limit.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/monitor.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/request-context.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/test-impact.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/validate.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/validator.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/lib/watcher.mjs` | No imports found anywhere | ✅ Tests pass |
| `daemon/ui.mjs` | No CLI command, no package.json entry, not imported | ✅ Tests pass |

**Total**: 12 files deleted, ~2,500 lines removed

---

### Files RESTORED (3) - Used by CLI Entry Point

| File | Used By | Mechanism |
|------|---------|-----------|
| `daemon/lib/semantic.mjs` | `cli.mjs` (line 224) | Dynamic import `await import('./daemon/lib/semantic.mjs')` |
| `daemon/lib/search-ignore.mjs` | `semantic.mjs` (line 3) | Static import |
| `daemon/lib/file-extensions.mjs` | `semantic.mjs` (line 4) | Static import |

---

### Files Kept - Child Process Worker

| File | Used By | Mechanism |
|------|---------|-----------|
| `daemon/agent/job-worker.mjs` | `daemon/agent/job-queue.mjs` | `spawn('node', [workerPath])` - child process |

---

### Files Kept - Frontend Assets (3)

| File | Served By | Mechanism |
|------|-----------|-----------|
| `daemon/public/lib/planner.js` | `express.static(publicDir)` | Static file serving |
| `daemon/public/lib/reports.js` | `express.static(publicDir)` | Static file serving |
| `daemon/public/lib/workspace.js` | `express.static(publicDir)` | Static file serving |

---

### Files Kept - Test Dependencies (4)

| File | Test Files |
|------|------------|
| `daemon/workspace/skill-index.mjs` | `tests/skill-index.test.mjs` |
| `daemon/workspace/service.mjs` | `tests/workspace-http.test.mjs`, `tests/workspace.test.mjs` |
| `daemon/workspace/server.mjs` | `tests/workspace-http.test.mjs`, `tests/workspace.test.mjs` |
| `daemon/workspace/runner.mjs` | `tests/workspace.test.mjs` |

---

### Files Kept - Scripts/CLI Tools (4)

| File | Purpose | Status |
|------|---------|--------|
| `scripts/build-skill-index.mjs` | Skill index builder | Not in package.json, manual CLI |
| `scripts/convert-agency-agents.mjs` | Agent converter | Not in package.json, manual CLI |
| `scripts/workspace-browser-check.mjs` | Browser check | Not in package.json, manual CLI |
| `compiler/nokta-skill.mjs` | Skill manager CLI | Not in package.json scripts |

---

### Files Kept - Compiler Libs (5) - Via Barrel Export

| File | Exported By | Used By |
|------|-------------|---------|
| `compiler/lib/compile.mjs` | `compiler/lib/nokta.mjs` | `nokta-compile.mjs`, `nokta-gates.mjs` |
| `compiler/lib/detect.mjs` | `compiler/lib/nokta.mjs` | `nokta-discover.mjs` |
| `compiler/lib/gates.mjs` | `compiler/lib/nokta.mjs` | `nokta-gates.mjs` |
| `compiler/lib/packs.mjs` | `compiler/lib/nokta.mjs` | Pack loading |
| `compiler/lib/utils.mjs` | `compiler/lib/nokta.mjs` | All compiler CLIs |

---

### Files Kept - Unused Routes (2)

| File | Status |
|------|--------|
| `daemon/routes/admin.mjs` | Dynamically imported in server.mjs but may not be registered |
| `daemon/routes/billing.mjs` | Dynamically imported and registered in server.mjs |

---

### Files Kept - Workspace Skill Index (1)

| File | Status |
|------|--------|
| `daemon/workspace/skill-index.mjs` | Test dependency only |

---

## Verification Results

| Check | Result |
|-------|--------|
| Full test suite (280 tests) | ✅ **PASS** |
| ESLint (zero warnings) | ✅ **PASS** |
| Daemon startup | ✅ **HEALTHY** |
| Health endpoint | ✅ **OK** |
| All routes registered | ✅ **26 routes** |

---

## Impact Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Daemon lib files | 46 | 34 | -12 |
| Total source files | 148 | 136 | -12 |
| Lines of code (est.) | ~45,000 | ~42,500 | -2,500 |
| Test pass rate | 280/280 | 280/280 | ✅ Maintained |

---

## Remaining Dead Code Candidates (Need Investigation)

| File | Reason | Recommended Action |
|------|--------|-------------------|
| `scripts/build-skill-index.mjs` | Not in package.json scripts | Add to scripts or delete |
| `scripts/convert-agency-agents.mjs` | Not in package.json scripts | Add to scripts or delete |
| `scripts/workspace-browser-check.mjs` | Not in package.json scripts | Add to scripts or delete |
| `compiler/nokta-skill.mjs` | Not in package.json scripts | Add to scripts or delete |
| `daemon/workspace/skill-index.mjs` | Test dependency only | Move to test fixtures or keep |
| `daemon/routes/admin.mjs` | May not be registered | Verify dynamic import works |

---

## Next Steps for Full Operational Readiness

### Immediate (Week 1)
1. [ ] Add missing CLI scripts to package.json or delete
2. [ ] Verify admin route registration works
3. [ ] Add Zod validation schemas to all route handlers
4. [ ] Implement pagination on all list endpoints
5. [ ] Fix SSE authentication for event streams

### Short-term (Week 2-3)
6. [ ] Extract service registration from server.mjs into DI container
7. [ ] Split orchestrator.mjs into smaller modules
8. [ ] Replace child-process worker with in-process worker pool
9. [ ] Add query builder for database (Kysely/Drizzle)
10. [ ] Implement JWT key rotation
11. [ ] Add refresh token flow
12. [ ] Add login rate limiting (use login-rate-limit logic)

### Medium-term (Month 1-2)
13. [ ] Add circuit breaker to provider manager
14. [ ] Implement MFA support
15. [ ] Add distributed tracing
15. [ ] Add Prometheus metrics endpoint
16. [ ] Add integration test harness
17. [ ] Generate TypeScript types from OpenAPI
18. [ ] Add password reset flow
19. [ ] Implement email verification
20. [ ] Add GDPR erasure/portability endpoints