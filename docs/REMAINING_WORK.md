## Nokta - Remaining Work Queue

### Phase 5: Advanced Capability Layers

#### 5.1 Semantic Layer (RAG) (DONE)
- `daemon/lib/semantic.mjs` — TF-IDF vector search implementation (no external deps)
- `daemon/lib/file-extensions.mjs` — Shared file extension constants
- `daemon/lib/search-ignore.mjs` — Shared ignore directory constants
- `daemon/routes/search.mjs` — Added `POST /api/v1/search/semantic` endpoint
- `cli.mjs` — Added `nokta search <query>` CLI command

#### 5.2 Adversarial Layer
- `daemon/lib/critic-agent.mjs` — Critique/review agent implementation
- `daemon/lib/adversarial-loop.mjs` — Critic→Implementer→Critique cycle
- `daemon/routes/adversarial.mjs` — API: `POST /api/v1/adversarial/review`
- `cli.mjs` — CLI enhancement: fetch critic feedback

#### 5.3 Sandbox Layer
- `daemon/lib/sandbox.mjs` — Docker/WASM sandbox manager
- `daemon/lib/sandbox-exec.mjs` — Safe execution environment for generated code
- `daemon/routes/sandbox.mjs` — API: `POST /api/v1/sandbox/exec`
- Security: isolation, timeout, resource limits

#### 5.4 Evolution Layer
- `daemon/lib/skill-synthesizer.mjs` — Extract skills from successful agent patterns
- `daemon/lib/skill-ranking.mjs` — Rank skills by effectiveness using feedback data
- `daemon/routes/skills/synthesize.mjs` — API: `POST /api/v1/skills/synthesize`

### Phase 6: Quality & Polish

#### 6.1 OpenAPI Documentation
- `docs/openapi.yaml` — Full OpenAPI 3.0 spec for all routes
- `daemon/routes/openapi.mjs` — Serve OpenAPI at `/api/v1/docs`
- `cli.mjs` — CLI: `nokta api-doc` to print spec

#### 6.2 Database Migrations
- `daemon/db/migrate.mjs` — Replace raw queries with migration framework
- `daemon/db/migrations/` — Versioned migration files
- `cli.mjs` — CLI: `nokta migrate up/down`

### Phase 7: Technical Debt & Fixes (DONE)

#### 7.1 Auth Error Handling (DONE)
- `daemon/routes/projects.mjs` — try/catch on addProject/removeProject with AppError
- `daemon/routes/brain.mjs` — try/catch on all operations, 401 guard on req.user?.id
- Optional chaining `req.user?.id` consistent with agent-runs.mjs pattern

#### 7.2 Health Check Enhancement (DONE)
- `daemon/routes/health.mjs` — Added `trackRoute()` function, health returns `routes` array
- `daemon/server.mjs` — Track 'projects' and 'brain' route registration

#### 7.3 E2E Tests (DONE)
- `tests/daemon.test.mjs` — Added 5 tests: routes check, projects auth, brain auth, semantic search
- Total: 129 tests now (was 125)

### Validation Checklist
- [x] All 129 tests pass
- [x] `npm run lint` passes with 0 errors
- [x] `node daemon/server.mjs` boots without errors
- [x] New routes return 200/401/404 appropriately (verified by tests)
- [x] CLI `nokta search` works correctly
