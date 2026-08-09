# Nokta — Production Readiness Roadmap

> **Status:** Blocker resolved, estimate/auto-prioritize implemented, CLI created. Lint ✅ | Tests ✅ 100/100 | Daemon starts ✅
> **Next:** Reports module, design decision tracking, learning integration

## Current State Summary

| Category | Status | Notes |
|---|---|---|
| Lint (eslint) | ✅ Pass | `--max-warnings 0` clean |
| Tests (node --test) | ✅ 100/100 | All pass |
| Daemon startup | ✅ Starts | Health check responds |
| Core sprint engine | ✅ Implemented | `sprint-engine.mjs` has full CRUD + estimate + auto-prioritize |
| Planner frontend UI | ✅ Implemented | `index.html` + `planner.js` |
| **Planner API routes** | ✅ **COMPLETE** | All CRUD endpoints implemented and tested |
| File watcher | ✅ Done | `AutoWatcher` wired to `SprintEngine.autoUpdate` |
| CLI (`cli.mjs`) | ✅ Done | `nokta compile`, `gates`, `detect`, `review-pr`, `review-branch` |
| Estimate function | ✅ Done | Story point estimation with learning |
| Auto-prioritize | ✅ Done | Dependency-based, deadline-based, code health prioritization

---

## Phase 1 — Critical Blocker Fix (Must Do Now)

### 1.1 Implement Missing Planner API Routes — `daemon/routes/planner.mjs`

The frontend (`daemon/public/lib/planner.js`) calls these endpoints that **don't exist**:

**Items:**
- `GET /api/v1/planner/items` — list items with filters (type, status, sprint, priority, label, search)
- `POST /api/v1/planner/items` — create item
- `GET /api/v1/planner/items/:id` — get single item
- `PATCH /api/v1/planner/items/:id` — update item (status, title, description, etc.)
- `DELETE /api/v1/planner/items/:id` — delete item

**Sprints:**
- `GET /api/v1/planner/sprints` — list all sprints
- `POST /api/v1/planner/sprints` — create sprint

**Epics & Initiatives:**
- `GET /api/v1/planner/epics` — list epics
- `POST /api/v1/planner/epics` — create epic
- `GET /api/v1/planner/initiatives` — list initiatives
- `POST /api/v1/planner/initiatives` — create initiative

**Brainstorm & Reports:**
- `POST /api/v1/planner/brainstorm` — generate AI brainstorm suggestions
- `GET /api/v1/planner/summary` — dashboard summary counts
- `GET /api/v1/planner/sprints/:id/report` — generate sprint report
- `POST /api/v1/planner/items/:id/feedback` — record accept/reject/edit feedback

**Implementation:** These routes must delegate to `SprintEngine` instance methods. Currently the planner routes file only has decision-linking endpoints.

### 1.2 Write Tests for Planner Routes

- `tests/planner.test.mjs` should test all new endpoints
- Test create/list/update/delete for items, sprints, epics, initiatives
- Test brainstorm endpoint
- Test summary endpoint

---

## Phase 2 — Sprint Engine Completeness

### 2.1 Implement Estimate Function (`daemon/lib/sprint-engine.mjs`)

Currently has **0 references** to estimate. Needs:
- Story point estimation using historical velocity
- User-override learning (record when user overrides estimate)
- Integration with the learning system

### 2.2 Implement Auto-Prioritize Function (`daemon/lib/sprint-engine.mjs`)

Currently has **0 references** to auto-prioritize. Needs:
- Dependency-based priority (items with more dependents → higher priority)
- Deadline-based priority (items due sooner → higher priority)
- Code health signals (files with more churn → higher priority)
- User history (items similar to previously accepted items → higher priority)

### 2.3 Wire File Watcher to Sprint Engine (`daemon/lib/watcher.mjs`)

- `autoUpdate()` method exists in sprint-engine but watcher doesn't call it
- Wire `FileWatcher.onChange` → `SprintEngine.autoUpdate()`
- Register watcher in `daemon/server.mjs` startup

### 2.4 Create CLI Commands (`cli.mjs`)

- `nokta review-pr <branch>` — PR review with convention checking
- `nokta review-branch <branch>` — Branch review
- Currently missing entirely

---

## Phase 3 — Reports & Visualization

### 3.1 Create Reports Module (`daemon/public/lib/reports.js`)

- Sprint burndown charts (Canvas-based SVG)
- Velocity tracking
- Completion rate metrics
- Token cost visualization

### 3.2 Add Reports View to Planner UI (`daemon/public/index.html`)

- Add "Reports" tab to sidebar navigation
- Integrate reports view into panel system
- Wire up with reports.js

### 3.3 Sprint Duration Configuration

- Add configurable sprint duration (default: 2 weeks)
- Store in `.nokta/config.json` or user preferences
- Display in sprint creation form

---

## Phase 4 — Design Intelligence Refinement

### 4.1 Design Decision Tracking (`.nokta/design-decisions/`)

- Create directory structure for design decisions
- Add endpoints to record/retrieve design decisions
- Integrate with decision engine

### 4.2 Architectural Recommendation Engine

- Build context-aware architectural suggestions
- Based on stack detection + design patterns
- Integrate into brainstorm flow

### 4.3 Technology Radar

- Track technology adoption stages (adopt, trial, assess, hold)
- Surface in compiled context

---

## Phase 5 — Self-Learning System

### 5.1 Wire Learning Into Brainstorm/Estimate/Prioritize

- Connect `getLearnedPatterns()` to brainstorm function
- Use learned patterns for better suggestions
- Record feedback from accepted/rejected items

### 5.2 Design Pattern Learning

- Track successful UI/UX patterns from implementations
- Store in `.nokta/learned/design-patterns.json`
- Correlate design outcomes with user satisfaction

### 5.3 Architecture Pattern Learning

- Track successful architectural decisions
- Store in `.nokta/learned/architecture-patterns.json`
- Extract ADRs from user corrections

---

## Phase 6 — Advanced Features

### 6.1 Dependency Graph Visualization

- Generate SVG dependency graph from items + dependencies
- Display in planner UI
- Show critical path

### 6.2 Prompt Template System

- Create standardized prompt templates for agent instructions
- Template library for common task types
- Integrate with compiler

### 6.3 Natural Language Interface

- NLI for architectural queries ("How should I handle auth?")
- Parse free-text into structured sprint items
- Integrate with decision engine

---

## Phase 7 — Quality & Completion

### 7.1 Integration Tests

- Write integration tests for sprint engine + planner routes
- Test file watcher → autoUpdate flow
- Test full daemon API surface

### 7.2 Universal Detection Tests

- Expand `tests/detect.test.mjs` with more stack combinations
- Test cross-stack detection (e.g., Next.js + Prisma + Stripe + Tailwind)
- Test self-learning detection patterns store

### 7.3 Test Suite Expansion (Target: 50+ tests)

| Current | Target |
|---|---|
| 86 tests | 50+ additional |

New test targets:
- Planner API routes (15-20 tests)
- Sprint engine estimate/prioritize (5-10 tests)
- File watcher integration (3-5 tests)
- Full daemon API integration (10-15 tests)
- Reports generation (5-8 tests)

---

## Phase 8 — Ecosystem & Extensibility

### 8.1 Plugin Architecture

- Formalize MCP plugin system (`daemon/routes/mcp.mjs` exists)
- Domain-specific knowledge packs
- External skill import

### 8.2 Design/Development Mode Toggles

- Add toggle in UI for "Design Mode" vs "Development Mode"
- Design Mode: emphasizes UI/UX feedback, design system integration
- Development Mode: emphasizes code quality, technical constraints

---

## Execution Order (Priority Queue)

```
🟢 DONE       → Phase 1.1: Implement planner API routes ✅
🟢 DONE       → Phase 1.2: Write tests for planner routes ✅
🟢 DONE       → File watcher already wired (AutoWatcher → SprintEngine.autoUpdate)
🟢 DONE       → Implement estimate function (story points + learning) ✅
🟢 DONE       → Implement auto-prioritize function (deps + deadlines + code health) ✅
🔴 BLOCKER    → Create CLI commands (nokta review-pr, nokta review-branch) — no cli.mjs
🟡 HIGH       → Create reports module (reports.js)
🟡 HIGH       → Add reports view to planner UI
🟡 HIGH       → Design decision tracking directory (.nokta/design-decisions/)
🟡 HIGH       → Wire learning into brainstorm (commonStoryPoints)
🟢 MEDIUM     → Phase 7.1: Integration tests for sprint engine + planner
🟢 LOW        → Phase 6+: Advanced features
```

## Current Progress

| Phase | Status | Tests | Lint |
|---|---|---|---|
| Phase 0 — Foundation | ⚠️ 3/4 | ✅ Pass | ✅ Clean |
| Phase 1 — Sprint Engine Core | ✅ 5/5 | ✅ Pass | ✅ Clean |
| Phase 2 — Planner UI | ✅ Complete | ✅ Pass | ✅ Clean |
| Phase 3 — Design Intelligence | ✅ Complete | ✅ Pass | ✅ Clean |
| Phase 4 — Architectural Intelligence | ⚠️ 2/5 | ✅ Pass | ✅ Clean |
| Phase 5 — Auto-Update | ✅ Done | ✅ Pass | ✅ Clean |
| Phase 6 — PR Review | ✅ 4/4 | ✅ Pass | ✅ Clean |
| Phase 7 — Reports | ⚠️ 1/4 | ✅ Pass | ✅ Clean |
| Phase 8 — Self-Learning | ⚠️ 3/7 | ✅ Pass | ✅ Clean |
| Phase 9 — Polish | ⚠️ 1/10 | ✅ Pass | ✅ Clean |
| Phase 10 — Ecosystem | ❌ 0/5 | ✅ Pass | ✅ Clean |

**Total: 100 tests, 0 lint errors**

## Verification Commands

After completing each phase:

```bash
npm run lint          # Must pass with 0 warnings
npm run test:ci       # All tests must pass
node daemon/index.mjs daemon --port 4217  # Daemon must start
curl http://localhost:4217/health         # Must return {"status":"ok",...}
```

## Next Action

**Implement reports module** (`daemon/public/lib/reports.js`) and **add reports view to planner UI** (`daemon/public/index.html`). The sprint report generator exists in `sprint-engine.mjs` but the UI and chart rendering module are missing.

See `docs/loop/TASK_LOG.md` for ongoing task tracking.
