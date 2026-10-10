# Architecture Review

**Generated**: 2026-09-28  
**Scope**: Nokta AI Operating System - System Architecture Assessment

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nokta AI OS                              │
├─────────────────────────────────────────────────────────────────┤
│  Entry Points                                                   │
│  ├── daemon/index.mjs      → Daemon HTTP Server (port 4217)    │
│  ├── cli.mjs               → Main CLI (nokta command)          │
│  ├── compiler/*.mjs        → Compile/Gates/Init/Discover       │
│  └── scripts/start-workspace.mjs → Workspace UI Server        │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Daemon Core    │ │  Compiler Core   │ │  Workspace       │
│  (daemon/)       │ │  (compiler/)     │ │  (daemon/work-   │
│                  │ │                  │ │   space/)        │
│ • Express Server │ │ • Context Compile│ │ • Skill Index    │
│ • Route Registry │ │ • Gate Evaluation│ │ • Agent Runner   │
│ • Auth/JWT       │ │ • Project Detect │ │ • HTTP API       │
│ • Rate Limiting  │ │ • Pack Loading   │ │                  │
│ • WebSocket/SSE  │ │                  │ │                  │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Database │ │ Providers│ │   Lib    │ │  Agents  │          │
│  │ (SQLite) │ │ (LLM)    │ │ (Utils)  │ │ (Orches- │          │
│  └──────────┘ └──────────┘ └──────────┘ │  trator) │          │
│                                         └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Analysis

### 1. Daemon Server (`daemon/server.mjs`) - Composition Root
**Lines**: 258  
**Responsibilities**:
- Express app creation & middleware stack
- Route registration (28 route modules)
- Service instantiation (ProviderManager, ChatHandler, CostTracker, GateKeeper, SprintEngine, DecisionEngine, AgentOrchestrator, AgentJobQueue, AutoWatcher, ProjectManager, UserBrain)
- Auth middleware (API key + JWT)
- Rate limiting (per-provider + global)
- Static file serving (public/)
- OpenAPI/Swagger UI
- Graceful shutdown

**Issues**:
- **God Object**: 258 lines, instantiates 15+ services, registers 28 routes
- **Tight Coupling**: All services created in one function, hard to test in isolation
- **No Dependency Injection**: Services instantiated directly, not injected
- **Mixed Concerns**: HTTP setup, business logic wiring, background jobs all in one place

### 2. Agent System
**Files**: 7 core files + 1 worker

| File | Responsibility | Issues |
|------|----------------|--------|
| `orchestrator.mjs` | Plan execution, worktree management, step running | 600+ lines, multiple responsibilities |
| `executor.mjs` | Step execution (edit, shell, prompt, review, pr, scope) | Growing complexity, review crash bug |
| `agent-pack.mjs` | Pack loading, skill selection, evidence handling | Complex, bounded context issues |
| `db-storage.mjs` | SQLite persistence for runs/steps | Direct SQL, no abstraction |
| `job-queue.mjs` | Background job queue with worker spawning | Spawns child process per job |
| `job-worker.mjs` | **Child process** - executes runs in isolation | Separate process, env-based communication |
| `project-context.mjs` | Builds project context for prompts | Large, does file scanning |
| `worktree.mjs` | Git worktree isolation | Critical for safety |

**Architecture Pattern**: Orchestrator → Executor → (Steps) with JobQueue → JobWorker (separate process)

**Issues**:
- **Process-per-job**: High overhead, no connection pooling
- **Env-based communication**: Brittle, no typed protocol
- **No retry/dead-letter**: Failed jobs just error
- **Orchestrator too large**: Violates SRP

### 3. Compiler (`compiler/`)
**Purpose**: Context compilation for AI agents
- `nokta-compile.mjs` → Compiles project context for agents
- `nokta-gates.mjs` → Evaluates trail gates (quality checks)
- `nokta-init.mjs` → Initializes .ai/trail and .nokta directories
- `nokta-discover.mjs` → Runs web discovery
- `nokta-skill.mjs` → Skill scanning/import (NOT in package.json)
- `lib/nokta.mjs` → Barrel export for all compiler libs
- `lib/*.mjs` (5 files) → Core compiler logic

**Issues**:
- `nokta-skill.mjs` not exposed via package.json
- Compiler and daemon share some libs but not cleanly separated

### 4. Provider System (`daemon/providers/`)
**Pattern**: Abstract base + concrete implementations
- `base.mjs` - Interface definition
- `claude.mjs`, `openai.mjs`, `ollama.mjs`, `openrouter.mjs` - Implementations
- `provider-manager.mjs` - Manages multiple providers, health checks, cost tracking

**Good**: Clean abstraction, easy to add providers
**Issues**: No circuit breaker, no automatic failover

### 4. Database (`daemon/db/`)
- `schema.mjs` - SQLite schema, migrations
- `connection.mjs` - Connection pool (better-sqlite3)

**Issues**: 
- Raw SQL throughout (no query builder)
- No migrations versioning (just `migrate()` function)
- Single connection pool, no read replicas

### 5. Authentication (`daemon/lib/auth.mjs`)
- JWT token generation/verification
- API key authentication (env var)
- Token blacklist for logout/revocation

**Issues**:
- Single secret from env, no rotation
- No refresh token mechanism
- Blacklist in memory (not persistent across restarts)

---

## Cross-Cutting Concerns

### Logging
- `daemon/lib/logger.mjs` - Pino-based structured logging
- Child loggers with service context
- Log levels configurable

### Configuration
- `daemon/lib/config.mjs` - Loads from `.nokta/config.json` + env overrides
- `daemon/lib/dotenv.mjs` - Loads `.env` files

### Rate Limiting
- `daemon/lib/rate-limit.mjs` - Token bucket per provider + global
- Tier-aware (uses auth middleware)

### Scope Enforcement
- `daemon/lib/scope-enforcer.mjs` - File/directory access control
- Fail-closed (deny by default)
- Validates mutations before write

### Cost Tracking
- `daemon/lib/cost-tracker.mjs` - Tracks LLM token usage/costs
- Per-provider, per-model, per-run

---

## Data Flow: Agent Run Execution

```
POST /api/v1/agent-runs (goal, draft?)
    │
    ▼
registerAgentRunRoutes → createRun (orchestrator)
    │
    ▼ (if not draft)
dispatch() → jobQueue.enqueue(runId)
    │
    ▼
AgentJobQueue._execute() → spawn('node', ['job-worker.mjs'])
    │
    ▼ (child process)
job-worker.mjs:
  - Reads env vars (NOKTA_JOB_*)
  - Creates AgentOrchestrator
  - executeRun(runId)
    │
    ▼
For each step in plan:
  executeStep(run, step, context)
    │
    ├── scope → scopeEnforcer.validateMutation()
    ├── edit  → scopeEnforcer.validateMutation() + write file
    ├── shell → spawn command
    ├── prompt → chatHandler.call()
    ├── review → sprintEngine.reviewPR()
    └── pr    → GitHub API
    │
    ▼
dbStorage.insertStepResult()
    │
    ▼
Run completes → status: completed/failed
```

---

## Architectural Issues Summary

| Severity | Issue | Location | Impact |
|----------|-------|----------|--------|
| **Critical** | God Object (server.mjs) | daemon/server.mjs | Hard to test, modify, reason about |
| **Critical** | No DI container | All services | Tight coupling, testing difficulty |
| **High** | Process-per-job overhead | job-queue.mjs → job-worker.mjs | Latency, resource waste |
| **High** | Env-based worker protocol | job-worker.mjs | Brittle, no type safety |
| **High** | Raw SQL everywhere | db-storage.mjs, agent-pack.mjs | SQL injection risk, hard to maintain |
| **Medium** | No circuit breaker | provider-manager.mjs | Cascading failures |
| **Medium** | Single JWT secret | auth.mjs | Security risk if compromised |
| **Medium** | Orchestrator too large | orchestrator.mjs | Violates SRP |
| **Low** | Mixed sync/async init | server.mjs createServer() | Confusing startup order |
| **Low** | No health check endpoints for deps | server.mjs | Hard to monitor dependencies |

---

## Recommended Refactoring Priorities

### Phase 1: Decomposition (High Impact)
1. Extract service registration from `server.mjs` into a `ServiceContainer` / DI setup
2. Split `orchestrator.mjs` into: `PlanExecutor`, `WorktreeManager`, `StepRunner`
3. Replace child-process worker with in-process worker pool (or proper message queue)

### Phase 2: Infrastructure (Medium Impact)
4. Add query builder / ORM layer for database
5. Implement proper DI container (or at least factory functions)
6. Add circuit breaker to provider manager
7. Implement JWT secret rotation

### Phase 3: Observability (Medium Impact)
8. Add structured health checks for all dependencies
9. Add distributed tracing (request IDs already present)
10. Metrics endpoint (Prometheus format)

### Phase 4: Developer Experience (Low Impact)
11. Add OpenAPI annotations to routes
12. Generate TypeScript types from OpenAPI
13. Add integration test harness