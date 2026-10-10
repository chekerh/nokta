# API Route Audit

**Generated**: 2026-09-28  
**Scope**: All 28 route modules in `daemon/routes/`

---

## Route Registration Overview

All routes registered in `daemon/server.mjs` createServer():

```javascript
// Static imports (loaded at startup)
registerAuthRoutes(app)                    // /api/v1/auth/*
registerChatRoutes(app)                    // /api/v1/chat/*
registerCompleteRoutes(app)                // /api/v1/complete/*
registerAgentRoutes(app)                   // /api/v1/agents/*
registerProviderRoutes(app)                // /api/v1/providers/*
registerCostRoutes(app)                    // /api/v1/costs/*
registerGateRoutes(app)                    // /api/v1/gates/*
registerTrailRoutes(app)                   // /api/v1/trail/*
registerSearchRoutes(app)                  // /api/v1/search/*
registerContextRoutes(app)                 // /api/v1/context/*
registerMcpRoutes(app)                     // /api/v1/mcp/*
registerCodeActionRoutes(app)              // /api/v1/code-actions/*
registerHealthRoute(app)                   // /health, /api/v1/health
registerSkillRoutes(app)                   // /api/v1/skills/*
registerUiUxRoutes(app)                    // /api/v1/uiux/*
registerTrustRoutes(app)                   // /api/v1/trust/*

// Dynamic imports (loaded async)
registerBillingRoutes(app)                 // /api/v1/billing/*
registerAdminRoutes(app)                   // /api/v1/admin/*
registerProjectRoutes(app)                 // /api/v1/projects/*
registerBrainRoutes(app)                   // /api/v1/brain/*
registerAdversarialRoutes(app)             // /api/v1/adversarial/*
registerSandboxRoutes(app)                 // /api/v1/sandbox/*
registerSkillEvolutionRoutes(app)          // /api/v1/skill-evolution/*
registerPlannerRoutes(app)                 // /api/v1/planner/*
registerDecisionRoutes(app)                // /api/v1/decisions/*
registerAgentRunRoutes(app)                // /api/v1/agent-runs/*
```

---

## Route Inventory

| Route Module | Base Path | Methods | Auth Required | Description |
|--------------|-----------|---------|---------------|-------------|
| `auth.mjs` | `/api/v1/auth` | POST login, register, GET me | No (login/register), Yes (me) | JWT auth |
| `chat.mjs` | `/api/v1/chat` | POST completion, GET models | Yes | LLM chat |
| `complete.mjs` | `/api/v1/complete` | POST | Yes | Text completion |
| `agents.mjs` | `/api/v1/agents` | GET list, GET :id, POST execute | Yes | Agent catalog & execution |
| `providers.mjs` | `/api/v1/providers` | GET list, GET health, POST switch | Yes | LLM provider mgmt |
| `costs.mjs` | `/api/v1/costs` | GET summary, GET runs | Yes | Cost tracking |
| `gates.mjs` | `/api/v1/gates` | POST evaluate | Yes | Trail gate evaluation |
| `trail.mjs` | `/api/v1/trail` | GET index, GET session, POST session | Yes | Trail protocol |
| `search.mjs` | `/api/v1/search` | POST semantic, GET code | Yes | Search |
| `context.mjs` | `/api/v1/context` | GET project, GET file | Yes | Project context |
| `mcp.mjs` | `/api/v1/mcp` | POST tools, GET resources | Yes | MCP protocol |
| `code-actions.mjs` | `/api/v1/code-actions` | POST apply, GET suggestions | Yes | Code actions |
| `health.mjs` | `/health`, `/api/v1/health` | GET | No | Health check |
| `skills.mjs` | `/api/v1/skills` | GET list, POST install, POST scan | Yes | Skill management |
| `uiux.mjs` | `/api/v1/uiux` | POST analyze, POST improve | Yes | UI/UX analysis |
| `trust.mjs` | `/api/v1/trust` | GET dashboard, POST score | Yes | Trust scoring |
| `billing.mjs` | `/api/v1/billing` | GET config, POST portal, POST webhook | Yes | Stripe billing |
| `admin.mjs` | `/api/v1/admin` | GET stats, POST cleanup | Yes (admin) | Admin ops |
| `projects.mjs` | `/api/v1/projects` | CRUD projects | Yes | Project mgmt |
| `brain.mjs` | `/api/v1/brain` | GET/POST preferences | Yes | User brain |
| `adversarial.mjs` | `/api/v1/adversarial` | POST review | Yes | Adversarial review |
| `sandbox.mjs` | `/api/v1/sandbox` | POST execute | Yes | Code sandbox |
| `skill-evolution.mjs` | `/api/v1/skill-evolution` | POST evolve | Yes | Skill evolution |
| `planner.mjs` | `/api/v1/planner` | POST plan | Yes | Task planning |
| `decisions.mjs` | `/api/v1/decisions` | POST decide | Yes | Decision engine |
| `agent-runs.mjs` | `/api/v1/agent-runs` | CRUD runs, POST execute, POST auto | Yes | Agent run lifecycle |

---

## Detailed Route Analysis

### `/api/v1/agent-runs` - `daemon/routes/agent-runs.mjs` (CRITICAL)

**Endpoints**:
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/` | `createRun` | Create run (enqueues unless draft:true) |
| GET | `/` | `listRuns` | List runs with filters |
| GET | `/:id` | `getRun` | Get run details |
| POST | `/:id/execute` | `executeRun` | Execute queued/created run |
| POST | `/:id/cancel` | `cancelRun` | Cancel running run |
| DELETE | `/:id` | `deleteRun` | Delete run |
| POST | `/generate` | `generateRun` | Generate steps only |
| POST | `/auto` | `autoRun` | Unified create+execute |
| GET | `/events` | `sseEvents` | SSE event stream |

**Auth**: All require auth (via middleware chain)

**Recent Changes** (from git):
- Added `draft` option to create (stays in `created` status)
- Added `started` response field
- 409 conflict for re-executing running/queued runs
- Shared `dispatch()` function for create/auto/execute

**Issues**:
- No pagination on list endpoint (returns all)
- No run timeout enforcement at API level
- SSE endpoint lacks authentication (uses same middleware but SSE auth is tricky)
- `generateRun` and `autoRun` duplicate logic with `createRun`

### `/api/v1/agents` - `daemon/routes/agents.mjs`

**Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all agent packs |
| GET | `/:id` | Get agent pack details |
| POST | `/:id/execute` | Execute agent pack |

**Issues**:
- Pack execution doesn't validate user owns project
- No rate limiting on pack execution

### `/api/v1/auth` - `daemon/routes/auth.mjs`

**Endpoints**:
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | No | Email/password → JWT |
| POST | `/register` | No | Create account |
| GET | `/me` | Yes | Current user |

**Issues**:
- Password stored as bcrypt but no complexity requirements
- No email verification
- No password reset flow
- JWT secret from env, no rotation

### `/api/v1/chat` - `daemon/routes/chat.mjs`

**Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Chat completion |
| GET | `/models` | List available models |

**Issues**:
- No streaming support (SSE)
- No conversation history persistence
- Model selection not validated against provider

### `/api/v1/providers` - `daemon/routes/providers.mjs`

**Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List providers with health |
| GET | `/health` | Health check all |
| POST | `/switch` | Switch active provider |

**Issues**:
- Health check can be slow (calls each provider)
- No circuit breaker on provider failure

### `/api/v1/billing` - `daemon/routes/billing.mjs` (Dynamic Import)

**Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Stripe publishable key, plans |
| POST | `/portal` | Create billing portal session |
| POST | `/webhook` | Stripe webhook handler |

**Issues**:
- Webhook signature verification?
- No idempotency keys for portal sessions

### `/api/v1/admin` - `daemon/routes/admin.mjs` (Dynamic Import - NOT REGISTERED?)

**Wait**: server.mjs line 163-165:
```javascript
const { registerAdminRoutes } = await import('./routes/admin.mjs');
registerAdminRoutes(app);
```

But `admin.mjs` is in dead code list... Let me check if it's actually exported properly.

---

## Auth Middleware Chain

All routes (except health, login, register, openapi, docs, billing/config, static) go through:

```javascript
app.use(authMiddleware(false));  // Optional auth - adds user to req
app.use(rateLimit(...));         // Global rate limit
```

Then individual routes may add:
```javascript
authMiddleware(true)  // Required auth - 401 if no user
```

**Auth Middleware** (`daemon/lib/auth.mjs`):
- `verifyToken(token)` - Validates JWT, returns user or null
- `authMiddleware(required)` - Express middleware
- JWT secret from `process.env.NOKTA_JWT_SECRET`
- Token blacklist for revocation

---

## Route Testing Status

| Route Module | Test File | Coverage |
|--------------|-----------|----------|
| `agent-runs.mjs` | `tests/agent-run-routes.test.mjs` | 10 tests (3 pass, 7 fail → fixed) |
| `auth.mjs` | `tests/auth.test.mjs` | Basic |
| `scope-enforcer` | `tests/scope-enforcer.test.mjs` | 13 tests |
| `agent-run-db` | `tests/agent-run-db.test.mjs` | 29 tests |
| Others | Various | Minimal |

---

## Issues & Recommendations

### Critical
1. **`admin.mjs` registration**: Verify dynamic import works; add to reachability
2. **No API versioning strategy**: All routes under `/api/v1/` but no deprecation policy
3. **SSE auth**: `/api/v1/agent-runs/events` needs proper auth for EventSource

### High
4. **Input validation**: Most routes use `asyncHandler` but no schema validation (Zod/Joi)
5. **Error handling**: Inconsistent - some use AppError, some throw raw errors
6. **Rate limiting**: Per-route limits not configured (only global)

### Medium
7. **OpenAPI documentation**: Only partial (health, billing/config documented)
8. **Request/Response types**: No TypeScript interfaces for API contracts
9. **Pagination**: Missing on list endpoints (agent-runs, agents, skills, etc.)

### Low
10. **Route organization**: Consider feature-based grouping instead of flat routes/
11. **Middleware order**: authMiddleware before rateLimit means unauthenticated requests count against limit

---

## Action Items

1. [ ] Verify `admin.mjs` dynamic import works in production
2. [ ] Add Zod schemas to all route handlers
3. [ ] Implement pagination on all list endpoints
4. [ ] Add OpenAPI annotations to all routes
5. [ ] Fix SSE authentication for event streams
6. [ ] Add per-route rate limit configuration
7. [ ] Document API versioning policy
8. [ ] Add integration tests for all route modules