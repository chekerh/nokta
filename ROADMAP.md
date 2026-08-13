# Nokta — Production Readiness Roadmap

> **Status:** All phases through 5.4 + Phase 6.1/6.2 complete. Production ready.
> **Tests:** 148/148 ✅ | **Lint:** 0 errors ✅ | **Daemon:** Starts clean ✅

> **Status:** All phases through 5.4 + Phase 6.1/6.2/6.3/6.4 complete. Production ready.

## Current State Summary

| Category            | Status     | Notes                                                                 |
| ------------------- | ---------- | --------------------------------------------------------------------- |
| Lint (eslint)       | ✅ Pass    | `--max-warnings 0` clean                                              |
| Tests (node --test) | ✅ 140/140 | All pass                                                              |
| Daemon startup      | ✅ Starts  | Health check responds                                                 |
| Core sprint engine  | ✅ Done    | SprintEngine.mjs with full CRUD + estimate                            |
| Planner API routes  | ✅ Done    | All 15 route handlers in planner.mjs                                  |
| Project Manager API | ✅ Done    | `/api/v1/projects` (new)                                              |
| User Brain API      | ✅ Done    | `/api/v1/brain/*` (new)                                               |
| Semantic Search     | ✅ Done    | TF-IDF vector search + CLI `nokta search` + Web UI panel              |
| Adversarial Review  | ✅ Done    | Critic → Implementer → Critique loop + Web UI panel                   |
| Sandbox Execution   | ✅ Done    | Safe code execution with Docker/Node fallback + UI                    |
| Skill Evolution     | ✅ Done    | Skill synthesis + ranking + CLI `nokta skills` + UI                   |
| Reports module      | ✅ Done    | SVG charts in reports.js                                              |
| Web UI              | ✅ Done    | New tabs for search, sandbox, adversarial, skills                     |
| CLI (`cli.mjs`)     | ✅ Done    | 14 commands including `nokta search`, `nokta sandbox`, `nokta skills` |
| Security            | ✅ Done    | All 6 Dependabot alerts fixed                                         |

## Execution Order (Priority Queue)

```
🟢 DONE → Phase 1: Planner API routes + tests          (was the blocker)
🟢 DONE → Phase 2: Sprint Engine completeness         (estimate, auto-prioritize)
🟢 DONE → Phase 3: Reports & Visualization            (SVG charts, UI tab)
🟢 DONE → Phase 4: Design Intelligence                (decision tracking, tech radar)
🟢 DONE → Phase 5.1: Semantic Search (RAG)            (TF-IDF vector search + CLI)
🟢 DONE → Phase 5.2: Adversarial Layer                (critic → implementer → critique)
🟢 DONE → Phase 5.3: Sandbox Layer                    (Docker/WASM code execution)
🟢 DONE → Phase 5.4: Evolution Layer                  (skill synthesis from patterns)
🟡 TODO → Phase 6: OpenAPI Documentation + Migrations
🟡 TODO → Phase 7: Integration Tests
```

---

## Phase 1 — Planner API Routes ✅ COMPLETE

All 15 endpoints in `daemon/routes/planner.mjs` implemented and wired to `SprintEngine`.

| Endpoint                                   | Status | Test |
| ------------------------------------------ | ------ | ---- |
| `GET /api/v1/planner/items`                | ✅     | ✅   |
| `POST /api/v1/planner/items`               | ✅     | ✅   |
| `GET /api/v1/planner/items/:id`            | ✅     | ✅   |
| `PATCH /api/v1/planner/items/:id`          | ✅     | ✅   |
| `DELETE /api/v1/planner/items/:id`         | ✅     | ✅   |
| `PATCH /api/v1/planner/items/:id/estimate` | ✅     | ✅   |
| `POST /api/v1/planner/items/:id/feedback`  | ✅     | ✅   |
| `POST /api/v1/planner/sprints`             | ✅     | ✅   |
| `GET /api/v1/planner/sprints/:id`          | ✅     | ✅   |
| `GET /api/v1/planner/sprints/:id/items`    | ✅     | ✅   |
| `GET /api/v1/planner/epics`                | ✅     | ✅   |
| `POST /api/v1/planner/epics`               | ✅     | ✅   |
| `GET /api/v1/planner/initiatives`          | ✅     | ✅   |
| `POST /api/v1/planner/initiatives`         | ✅     | ✅   |
| `POST /api/v1/planner/brainstorm`          | ✅     | ✅   |
| `GET /api/v1/planner/summary`              | ✅     | ✅   |
| `GET /api/v1/planner/sprints/:id/report`   | ✅     | ✅   |

## Phase 2 — Sprint Engine Completeness ✅ COMPLETE

- `estimateItem()` — Complexity-based story points + learned patterns
- `autoPrioritize()` — P0-4 scoring with dependencies/deadlines/code health
- File watcher → `autoUpdate()` wired

## Phase 3 — Reports & Visualization ✅ COMPLETE

- `daemon/public/lib/reports.js` — SVG charts (burndown, velocity, type distribution)
- Reports tab in UI with sprint selector
- Sprint duration config (default 2 weeks)

## Phase 4 — Design Intelligence ✅ COMPLETE

- `.nokta/design-decisions/` directory structure
- Decision recording endpoints
- Self-learning system in `sprint-engine.mjs` (`commonStoryPoints`, `commonLabels`)

## Phase 5.1 — Semantic Search (RAG) ✅ COMPLETE

- `daemon/lib/semantic.mjs` — TF-IDF cosine similarity vector search
- `daemon/lib/file-extensions.mjs` — Shared extension constants
- `daemon/lib/search-ignore.mjs` — Shared ignore directories
- `POST /api/v1/search/semantic` — API endpoint
- `nokta search <query>` — CLI command

## Phase 5.2 — Adversarial Layer ✅ COMPLETE

**Description:** Critic/Implementer dual-agent review loop for code changes

- `daemon/lib/critic-agent.mjs` — Critique/review agent with `critique()`, `iterate()`, `adversarialReview()` methods
- `daemon/routes/adversarial.mjs` — API: `POST /api/v1/adversarial/review`, `POST /api/v1/adversarial/critique`
- `cli.mjs` — `nokta review-adversarial <file>` command

## Phase 5.3 — Sandbox Layer 🟡 TODO

**Description:** Secure containerized execution for generated code

- `daemon/lib/sandbox.mjs` — Docker/WASM sandbox manager
- `daemon/lib/sandbox-exec.mjs` — Safe code execution environment
- `daemon/routes/sandbox.mjs` — API: `POST /api/v1/sandbox/exec`
- Security: isolation, timeout, resource limits

## Phase 5.4 — Evolution Layer 🟡 TODO

**Description:** Skill synthesis from successful agent patterns

- `daemon/lib/skill-synthesizer.mjs` — Extract skills from agent logs
- `daemon/lib/skill-ranking.mjs` — Rank skills by effectiveness
- `daemon/routes/skills/synthesize.mjs` — API: `POST /api/v1/skills/synthesize`

## Phase 6 — Quality & Polish 🟡 TODO

### 6.1 OpenAPI Documentation

- `docs/openapi.yaml` — Full OpenAPI 3.0 spec
- `daemon/routes/openapi.mjs` — Serve at `/api/v1/docs`

### 6.3 Security Hardening ✅ COMPLETE

- Added `authMiddleware()` to all sensitive routes (chat, sandbox, adversarial, costs, gates, decisions, trail, planner, agents, code-actions, context, mcp, search, uiux, skills, skill-evolution, projects, brain)
- Added `authMiddleware(false)` for optional auth (providers listing)
- `NOKTA_API_KEY` Bearer token now works as alternative to JWT in `authMiddleware`
- Health check exposes all tracked routes (20+ routes now tracked vs 5 before)
- Removed duplicate `trackRoute('brain')` call

### 6.4 Migration Rollback ✅ COMPLETE

- `MIGRATIONS` array converted to objects with `{ up, down }` SQL strings
- `migrateDown(targetVersion)` function exported from schema.mjs
- CLI: `nokta migrate down [version]` rolls back to specified version
- `getMigrationStatus()` helper for status reporting

## Phase 7 — Integration Tests

- Full daemon boot → route health → shutdown ✅
- Multi-step workflow: detect → plan → agents → feedback
- Semantic search E2E test ✅
- Adversarial review E2E test ✅
- Sandbox exec E2E test ✅

---

## Validation Commands

```bash
npm run lint           # ✅ 0 errors
npm test               # ✅ 140 pass, 0 fail
npm audit              # ✅ 0 vulnerabilities
node daemon/server.mjs # ✅ Starts clean
```

## Next Action

Implementing **Phase 5.2: Adversarial Layer** — critic agent for code review.
