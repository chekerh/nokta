# Nokta Loop State

## Current Loop

- **Phase:** DOCUMENTING → PERSISTING → SELECTING_NEXT
- **Completed (2026-10-08 → 2026-10-13):** Fleet tracking/discovery, review gates (rendered-UI + dialog semantics), sandbox stabilization, codebase audit, npm audit remediation, audit Phase 1 (npm scripts, SSE auth, pagination, zod body validation), audit Phase 3 (password reset, JWT key rotation, refresh tokens), audit Phase 4 Task 4.1 (per-dependency health checks), Task 4.2 (Prometheus metrics), Task 4.3 (request correlation ids)
- **Validation:** Lint ✅ 0 errors · Tests ✅ 409/409 pass · npm audit ✅ 0 vulnerabilities
- **Next Task:** Audit Phase 4 Task 4.4 (TypeScript types from OpenAPI); Phase 2 remains

## Loop State Tracker

```
TRIGGERED → DISCOVERING → TRIAGING → SPECIFYING → RESEARCHING
→ PLANNING → DELEGATING → EXECUTING → VERIFYING → REVIEWING
→ RECONCILING → DOCUMENTING → PERSISTING → SELECTING_NEXT

Current: DOCUMENTING → PERSISTING → SELECTING_NEXT
```

## Objective

Land audit remediation from `audit/ACTION-PLAN.md` on `main` via PR (Phase 1 and Phase 3 complete), and keep Nokta production-ready.

## Scope And Constraints

- **In scope:** Remaining gap work from discovery, tests, docs, audit phases, merge readiness
- **Out of scope:** None defined this cycle (Phase 1 + Phase 3 complete)
- **Constraints:** Must pass lint, 409/409 tests, and npm audit (0 vulnerabilities)

## Validation Status

- **Lint:** ✅ Pass (0 errors, 0 warnings)
- **Tests:** ✅ 409/409 pass
- Product goal (agent-awareness) landed on `main` via PR #25 (`d15e9c8`, TASK-022): filesystem-only per-project agent detection + machine-wide installed agents (`tool-detector.mjs`), origin-resolving GitHub context with structured failure reasons (`github-context.mjs`), a pure plan+context→prompt renderer (`prompt-builder.mjs`), and agent/GitHub/prompt panels in the existing workspace UI backed by `GET /api/workspace/projects/:id/{context,prompt}`.
- **Daemon:** ✅ Starts and responds to health check
- **npm audit:** ✅ 0 vulnerabilities (proxy-addr, qs, js-yaml, brace-expansion patched)
- **Fleet:** ✅ Track/discover/plan/queue live opencode + freebuff sessions
- **Review gates:** ✅ Rendered-UI gate, dialog semantics gate, sandbox useDocker=false
- **Audit:** ✅ 12 dead files removed, 9 audit docs in `audit/` + `AUDIT-COMPLETE.md`
- **Browser checks:** ✅ `scripts/workspace-browser-check.mjs` green (playwright + Chrome)
- **CLI:** ✅ `review-pr`, `review-branch`, `compile`, `gates`, `detect`, `search`, `sandbox`, `skills` commands
- **Security:** ✅ SSE run-events stream now auth-gated (`?token=`/Bearer), route order fixed; npm scripts wired (TASK-012→014); request bodies validated with zod across all body-reading routes (TASK-015); password reset flow with hashed one-time tokens + generic no-enumeration responses (TASK-016); JWT tokens carry a `kid` and rotate without invalidating live sessions (TASK-017); short-lived access tokens + DB-backed single-use rotating refresh tokens with reuse detection and a `token_version` that invalidates access tokens on password change/reset, revoked on logout (TASK-018)

## Open Discussion

- `feature-review-stat-index` merged into `main` via PR #14 (merge commit `24582dc`, 2026-10-10) after clean-merge + CI verification. Now on `main`; merge chain: main `→` development as needed.
- Audit Phase 1 merged into `main` via PR #15 (2026-10-12): SSE auth `3242347`, npm scripts `67a3ced`, pagination `cbdff5d`, loop docs `5a0a1cd`. Now on `main`.
- `docs/loop/TASK_LOG.md` and `BLOCKERS.md` refreshed with Oct 2026 history.
- Audit Phase 1 now fully landed: Tasks 1.1–1.5 done — npm scripts `67a3ced`, SSE auth `3242347`, pagination `cbdff5d` (PR #15), zod body validation (PR #17).
- Dependabot alert #10 (`source-map-js` < 1.2.2, dev-only in `landing/`) resolved via PR #16; stale qs PR #13 closed as superseded (fix already on `main`).
- Audit Phase 3 started: Task 3.4 password reset landed on `feat/password-reset` (TASK-016). Task 3.3 (login rate limiting) was already shipped as `daemon/lib/rate-limit.mjs`.
- Audit Phase 3 Task 3.1 JWT signing-key rotation landed on `feat/jwt-rotation` (TASK-017): `kid` in every token, key ring verifies retired keys, `NOKTA_JWT_PREVIOUS_SECRETS`.
- Audit Phase 3 Task 3.2 refresh tokens landed on `feat/refresh-tokens` (TASK-018): short-lived access tokens (15 min), DB-backed single-use rotating refresh tokens with reuse detection, `/api/v1/auth/refresh`, revocation + `token_version` bump on password change/reset, all-session revocation on logout, silent client refresh on 401. Hardened after independent security + code review, then verified again post-merge by a live E2E run and a second independent security pass; second-pass findings (blacklist eviction fallback, shorter reuse grace, TTL clamps, trust-proxy opt-in, logout token_version bump, auth-limiter store split, cross-tab refresh retry, transient-refresh handling, self-XSS onclick escape, idempotent v5 migration) landed in a follow-up hardening PR. **Audit Phase 3 complete.**
- Audit Phase 4 Task 4.1 per-dependency health checks landed on `feat/health-checks` (TASK-019): `daemon/lib/health.mjs` probes database (schema/sqlite version), disk (free bytes/percent), and providers; `/health` exposes `dependencies`. Provider sweep cached 5 s + 8 s timeout; top-level status tracks db+disk readiness. Hardened after an independent code review (unguarded sweep, cache/timeout, error-vs-degraded, raw-ratio disk threshold).
- Audit Phase 4 Task 4.2 Prometheus metrics landed on `feat/prometheus-metrics` (TASK-020): `daemon/lib/metrics.mjs` (prom-client) exposes HTTP latency/requests/errors, active-runs and queue-length gauges, and an LLM token counter fed by `CostTracker`; `/metrics` requires the API key when set and is rate-limit exempt. Hardened after an independent code review (auth on `/metrics`, SSE duration, abort labelling, defensive gauge reads).
- Audit Phase 4 Task 4.3 request correlation ids landed on `feat/distributed-tracing` (TASK-021): `request-id.mjs` holds an `AsyncLocalStorage` context (sanitised/echoed `X-Request-Id`, `currentRequestId()`, `correlationHeaders()`); the logger stamps every line with the id; providers, the executor's GitHub call and discovery propagate it; and the job-queue carries it across the worker process boundary. Hardened after an independent code review (cross-process id was lost → now threaded via `NOKTA_JOB_REQUEST_ID`).
- Deferred from the TASK-018 review (follow-ups, not blockers): move the refresh token out of `localStorage` into an HttpOnly/SameSite cookie (M4), and make `/auth/register`'s duplicate-email response generic to close the last enumeration vector (L4).

## Next Action

Run discovery to pick the next highest-value item: audit Phase 4 (observability — health checks, metrics, tracing) or audit Phase 2 refactors.
