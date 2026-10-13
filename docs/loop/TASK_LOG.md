# Task Log

## Task List

### Active Tasks

_None._

### Completed Tasks

| ID       | Task                                                                                                                               | Priority | Status    | Completed  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ---------- |
| TASK-000 | Analyze Nokta project status and create roadmap                                                                                    | HIGH     | COMPLETED | 2026-08-09 |
| TASK-001 | Implement missing planner API routes (CRUD for items, sprints, epics, initiatives, brainstorm, reports)                            | HIGH     | COMPLETED | 2026-08-09 |
| TASK-002 | Write tests for planner routes                                                                                                     | HIGH     | COMPLETED | 2026-08-09 |
| TASK-003 | Implement estimate function in sprint-engine                                                                                       | HIGH     | COMPLETED | 2026-08-19 |
| TASK-004 | Implement auto-prioritize function in sprint-engine                                                                                | HIGH     | COMPLETED | 2026-08-19 |
| TASK-005 | Wire file watcher to sprint engine autoUpdate                                                                                      | HIGH     | COMPLETED | 2026-08-19 |
| TASK-006 | Implement reports module (Canvas charts + Reports tab)                                                                             | HIGH     | COMPLETED | 2026-08-19 |
| TASK-007 | Codebase audit: dead code removal, architecture/API/DB/auth analysis                                                               | HIGH     | COMPLETED | 2026-09-28 |
| TASK-008 | Fleet: track/discover/plan/queue live opencode + freebuff sessions                                                                 | HIGH     | COMPLETED | 2026-10-08 |
| TASK-009 | Review gates: rendered-UI gate + dialog semantics on every Modal                                                                   | HIGH     | COMPLETED | 2026-10-08 |
| TASK-010 | Sandbox stabilization: useDocker=false default, per-test isolation, extra playwright dep                                           | HIGH     | COMPLETED | 2026-10-10 |
| TASK-011 | npm audit remediation: proxy-addr, qs, js-yaml, brace-expansion                                                                    | HIGH     | COMPLETED | 2026-10-10 |
| TASK-012 | Audit Phase 1 — Task 1.1: skill/agent/workspace tooling as npm scripts (skill:index, skill:manage, agent:convert, workspace:check) | HIGH     | COMPLETED | 2026-10-12 |
| TASK-013 | Audit Phase 1 — Task 1.5: authenticate the SSE run-events stream (route was shadowed by /runs/:id and open to anonymous callers)   | HIGH     | COMPLETED | 2026-10-12 |
| TASK-014 | Audit Phase 1 — Task 1.4: pagination (page/limit) on agent-runs, agents, skills, costs list endpoints                              | HIGH     | COMPLETED | 2026-10-12 |
| TASK-015 | Audit Phase 1 — Task 1.3: zod request-body validation on all body-reading routes                                                   | HIGH     | COMPLETED | 2026-10-12 |
| TASK-016 | Audit Phase 3 — Task 3.4: password reset flow (forgot/reset routes, hashed one-time tokens, injectable mailer)                     | HIGH     | COMPLETED | 2026-10-12 |
| TASK-017 | Audit Phase 3 — Task 3.1: JWT signing-key rotation (`kid` header, key ring, prior-secret verification)                             | HIGH     | COMPLETED | 2026-10-12 |
| TASK-018 | Audit Phase 3 — Task 3.2: refresh-token flow (DB-backed rotating refresh tokens, `/auth/refresh`, short-lived access tokens)       | HIGH     | COMPLETED | 2026-10-12 |
| TASK-019 | Audit Phase 4 — Task 4.1: per-dependency health checks (database + disk + providers surfaced on `/health`)                          | HIGH     | COMPLETED | 2026-10-13 |

## Task Details

### TASK-000: Analyze Nokta project status and create roadmap

- **Description:** Comprehensive analysis using graphify principles — stack detection, code structure analysis, test coverage, and gap analysis against PLAN.md
- **Evidence:** 86/86 tests pass, lint clean, daemon starts, but planner routes missing all CRUD endpoints
- **Output:** `ROADMAP.md` created with prioritized execution order

### TASK-001: Implement missing planner API routes

- **Description:** Added CRUD routes to `daemon/routes/planner.mjs` for items, sprints, epics, initiatives, brainstorm, summary, reports, and feedback
- **Status:** COMPLETED
- **Output:** 317 lines of route handlers covering all frontend API calls
- **Evidence:** 96/96 tests pass, lint clean

### TASK-002: Write tests for planner routes

- **Description:** Added integration tests for all new planner API endpoints
- **Status:** COMPLETED
- **Output:** `tests/planner-routes.test.mjs` with 10 tests covering all new endpoints
- **Evidence:** 96/96 tests pass

### TASK-003: Implement estimate function

- **Description:** Story point estimation with user-override learning
- **Status:** COMPLETED
- **Evidence:** `estimateItem` at `daemon/lib/sprint-engine.mjs:683`, all tests pass

### TASK-004: Implement auto-prioritize function

- **Description:** Dependency-based, deadline-based, code health, and user history prioritization
- **Status:** COMPLETED
- **Evidence:** `autoPrioritize` at `daemon/lib/sprint-engine.mjs:739`, all tests pass

### TASK-005: Wire file watcher to sprint engine

- **Description:** AutoWatcher wired in server; autoUpdate integration verified
- **Status:** COMPLETED

### TASK-006: Implement reports module

- **Description:** Canvas-based sprint burndown, velocity tracking, completion rate; Reports tab in UI
- **Status:** COMPLETED
- **Evidence:** `daemon/public/lib/reports.js` (344 lines), Reports tab at `daemon/public/index.html:771`

### TASK-007: Codebase audit (2026-09-28)

- **Description:** 12 dead files removed (~2,500 lines) in `daemon/lib`; architecture, route, DB schema, auth security reviewed; 9 docs in `audit/` + `AUDIT-COMPLETE.md`; phased `ACTION-PLAN.md`
- **Evidence:** 280/280 tests pass, 26 routes registered, daemon healthy

### TASK-008: Fleet (2026-10-08)

- **Description:** Track projects driven by opencode/freebuff, attach to live servers, auto-discover sessions/projects/goals, build plan + queue prompts, persist fleet state
- **Evidence:** `tests/fleet.test.mjs` (69 lines), `.nokta/fleet.json` (gitignored)

### TASK-009: Review gates (2026-10-08)

- **Description:** Rendered-UI gate so unknown-UI runs still complete; require dialog semantics on every Modal
- **Evidence:** `tests/ui-gates.test.mjs` (190 lines)

### TASK-010: Sandbox + dependency stabilization (2026-10-10)

- **Description:** `cli.mjs` forces `useDocker: false` for CLI sandbox runs; sandbox tests isolate `.nokta/sandbox` per run; added `playwright` devDep for browser checks
- **Evidence:** 301/301 tests pass, lint clean, `workspace-browser-check.mjs` green

### TASK-011: npm audit remediation (2026-10-10)

- **Description:** Bumped proxy-addr 2.0.7→2.0.8 (critical), qs 6.15.2→6.16.0, js-yaml 4.3.1→4.3.2, brace-expansion 1.1.18→1.1.21; verified audit clean
- **Evidence:** `npm audit` → 0 vulnerabilities; 301 tests still pass

### TASK-012: Audit Phase 1 — npm scripts for skill/agent tooling (2026-10-12)

- **Description:** Wired `skill:index`, `skill:manage`, `agent:convert`, `workspace:check` into `package.json`; fixed `compiler/nokta-skill.mjs` parseArgs (argv[3]/argv[4] → argv[2]/argv[3]) so every standalone command fell back to help
- **Evidence:** 23/23 cli-extended tests pass; scripts run; regression test pins `node nokta-skill.mjs list` dispatch

### TASK-013: Audit Phase 1 — SSE run-events auth (2026-10-12)

- **Description:** `GET /api/v1/agent-runs/events` was (a) registered after `GET /api/v1/agent-runs/:id`, so it always 404'd as a phantom run lookup, and (b) open to anonymous callers who could watch every run. Moved the route ahead of `:id`; verified a real user via JWT from `Authorization` or `?token=` (EventSource can't set headers); server gate accepts the query token on this path only; web UI passes the stored token. Added `requestToken()` to `auth.mjs`.
- **Evidence:** 14/14 route tests; live: no/bad token → 401, valid `?token=` → 200 `text/event-stream` that delivered `run:created`, `run:queued`, `run:completed`

### TASK-014: Audit Phase 1 — pagination on list endpoints (2026-10-12)

- **Description:** `GET /api/v1/agent-runs`, `/agents`, `/skills`, `/costs` accept `?page=1&limit=20`. Only engages when `page` present (backward compatible); `pagination` object (page, limit, total, totalPages); `/costs` keeps whole-range total. Shared `parsePagination`/`paginationMeta` in `route-utils.mjs`.
- **Evidence:** 319/319 tests pass; live: runs 0/0, costs total 7778 across 824 entries (page 3), agents 5 of 267 page 1, skills 0/0

### TASK-015: Audit Phase 1 — zod request-body validation (2026-10-12)

- **Description:** Completed Task 1.3 (previously deferred as "new dependency"). Added `zod` + `daemon/lib/schemas.mjs` (one schema family per route group) and `daemon/lib/validate.mjs` (`validateBody` middleware: missing body → `{}`, replaces `req.body` with parsed/defaulted value, raises a 400 `AppError` carrying per-field `{ path, message }` issues). Wired into all 24 mutating route files; unwired routes are body-less (run execute/cancel, fleet queue send, planner estimate) or raw-signed (billing webhook). `AppError` now carries optional `details`, merged into the JSON error response. Schemas are intentionally permissive (`.nullish()` / `.catchall`) so routes keep their own domain errors and the UI keeps working.
- **Evidence:** 325/325 tests pass (6 new in `tests/validation.test.mjs`); lint clean; static audit shows every `req.body`-reading mutating route runs `validateBody`; `audit/REQUEST-BODY-INVENTORY.md` documents the route→schema mapping

### TASK-016: Audit Phase 3 — password reset flow (2026-10-12)

- **Description:** Implemented Task 3.4 (account recovery). Migration v4 adds `password_resets` (only the SHA-256 hash of the token is stored). `POST /api/v1/auth/forgot-password` is rate limited and always returns a generic response (no email enumeration); on a match it supersedes prior links and emails a 1h link. `POST /api/v1/auth/reset-password` enforces the password policy, rejects unknown/expired/reused tokens (single-use), and writes the new hash. New injectable `daemon/lib/mailer.mjs` (no bundled SMTP client); both routes added to the API-key allowlist. Noted Task 3.3 (login rate limiting) already shipped as `daemon/lib/rate-limit.mjs`.
- **Evidence:** 331/331 tests pass (6 new in `tests/password-reset.test.mjs`: happy path, no-enumeration, token single-use, expiry, policy, required field); lint clean

### TASK-017: Audit Phase 3 — JWT signing-key rotation (2026-10-12)

- **Description:** Implemented Task 3.1. New `daemon/lib/jwt-keys.mjs` key ring (current signing key + retired keys for verification only), each keyed by a `kid` fingerprint. `createToken` embeds `kid` in the JWT header; `verifyToken` resolves by `kid` and falls back to the current key for legacy kid-less tokens, so upgrading does not log anyone out. Rotation: set `NOKTA_JWT_SECRET` to the new key + list retired keys in `NOKTA_JWT_PREVIOUS_SECRETS` (or call `rotateKeys()`). Documented in `.env.example` and `PRODUCTION.md`.
- **Evidence:** 337/337 tests pass (6 new in `tests/jwt-rotation.test.mjs`: kid emitted/verified, rotation keeps old tokens valid, unknown kid rejected, bad signature rejected, legacy token verified, env previous-secret accepted); lint clean

### TASK-018: Audit Phase 3 — refresh-token flow (2026-10-12)

- **Description:** Implemented Task 3.2. Access tokens are now short-lived (default 15 min, `NOKTA_ACCESS_TOKEN_TTL_SEC`; `NOKTA_TOKEN_TTL_SEC` honoured as fallback, and invalid values fall back to 900 rather than yielding non-expiring tokens) and a DB-backed refresh token (default 7 days, `NOKTA_REFRESH_TOKEN_TTL_SEC`, absolute 30-day family cap `NOKTA_REFRESH_MAX_SEC`) mints new ones. Migration v5 adds `refresh_tokens` (only the SHA-256 hash stored) and `users.token_version`. New `daemon/lib/refresh-tokens.mjs` issues/looks up/rotates/revokes; `POST /api/v1/auth/refresh` rotates on use with an atomic conditional UPDATE (single-use, concurrent-safe) plus a reuse-detection grace window that tears down the family on late replay; login/register return `refreshToken`; logout revokes all of a user's refresh tokens; password change and password reset revoke them _and_ bump `token_version` so outstanding access tokens are rejected too. The web client (`lib/ui.js` + `index.html`) refreshes silently on 401 and retries once, coalesces concurrent refreshes, reads the refresh token from storage at use time (multi-tab safe), and backs off/refreshes before SSE reconnect. `/auth/refresh` has its own rate limiter (60/min) and is on the API-key allowlist. Docker Compose now ships `NOKTA_ACCESS_TOKEN_TTL_SEC`/`NOKTA_REFRESH_TOKEN_TTL_SEC` instead of the legacy 7-day `NOKTA_TOKEN_TTL_SEC`. Hardened after an independent security + code review (atomic rotation, reuse detection, family cap, token-version invalidation, blacklist date handling, refresh-token cleanup job).
- **Evidence:** 355/355 tests pass (16 new: 14 in `tests/refresh-token.test.mjs` covering short TTL + refresh issued, rotation, single-use, unknown/expired token, missing/wrongly-typed token, logout revocation, cross-user isolation, reuse family revocation, concurrent refresh, grace-window race, logout invalidation of other access tokens, password-change revocation of refresh + access tokens, reset revocation, login reissue; plus `tests/token-ttl.test.mjs`, `tests/token-ttl-invalid.test.mjs` and `tests/token-ttl-clamp.test.mjs` for the `NOKTA_TOKEN_TTL_SEC` fallback, the invalid-TTL guard, and the 24h clamp); lint clean

### TASK-019: Audit Phase 4 — per-dependency health checks (2026-10-13)

- **Description:** Implemented Task 4.1. New `daemon/lib/health.mjs` probes each dependency: the database (via `getMigrationStatus()` — reports sqlite version, applied schema version, and total migrations; works even before the first migration), the data-directory disk (`fs.statfs` — total/available bytes, free percent, `warn` below 512 MB or 5% through a pure `classifyDisk`), and providers (a summary of `ProviderManager#health()` treating "no providers configured" as healthy). `GET /health` now exposes all three under `dependencies`. The provider sweep is cached per ProviderManager for 5 s and bounded by an 8 s timeout so LB polling cannot stampede model-list probes; a rejecting sweep degrades `dependencies.providers` instead of 500-ing. Top-level `status` reflects process readiness (db + disk): `error` on a hard probe failure, `degraded` on a soft one, and never flipped by provider health so instances keep failing over. Hardened after an independent code review (unguarded sweep, sweep cache/timeout, error-vs-degraded semantics, raw-ratio disk threshold, stable payload shape).
- **Evidence:** 368/368 tests pass (13 new in `tests/health.test.mjs`: DB probe + schema version, DB-unopenable failure path, disk probe + `classifyDisk` boundaries at/below 512 MB and 5%, provider summaries for empty/skipped/all-ok/degraded/error, `checkAll` aggregation and failed/null-sweep handling, and route-level checks for the healthy shape, provider-failure-does-not-flip-top-level, and a rejecting sweep); lint clean
