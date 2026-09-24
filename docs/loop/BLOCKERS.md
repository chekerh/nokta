# Blockers

## Active Blockers

_None._

## Resolved Blockers

### BLOCKER-001: Missing Planner API Routes (CRITICAL)

- **Severity:** Critical
- **Component:** `daemon/routes/planner.mjs`
- **Description:** The planner routes file only contained 3 decision-linking endpoints. The frontend Kanban board (`daemon/public/lib/planner.js`) called 15+ additional endpoints that didn't exist (items, sprints, epics, initiatives, brainstorm, reports CRUD).
- **Impact:** The entire Kanban board feature was non-functional.
- **Resolution:** All missing CRUD routes implemented in `daemon/routes/planner.mjs`, delegating to `SprintEngine` instance methods (TASK-001).
- **Status:** RESOLVED (2026-08-09, verified by TASK-002 tests)
