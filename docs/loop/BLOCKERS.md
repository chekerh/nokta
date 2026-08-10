# Blockers

## Active Blockers

### BLOCKER-001: Missing Planner API Routes (CRITICAL)

- **Severity:** Critical
- **Component:** `daemon/routes/planner.mjs`
- **Description:** The planner routes file only contains 3 decision-linking endpoints. The frontend Kanban board (`daemon/public/lib/planner.js`) calls 15+ additional endpoints that don't exist, including:
  - `GET /api/v1/planner/items` (list items)
  - `POST /api/v1/planner/items` (create item)
  - `PATCH /api/v1/planner/items/:id` (update item)
  - `DELETE /api/v1/planner/items/:id` (delete item)
  - `GET /api/v1/planiner/sprints` (list sprints)
  - `POST /api/v1/planner/sprints` (create sprint)
  - `POST /api/v1/planner/brainstorm` (AI brainstorming)
  - And more...
- **Impact:** The entire Kanban board feature is non-functional. Users cannot create tasks, move items between columns, or use AI brainstorming.
- **Resolution:** Implement all missing CRUD routes in `daemon/routes/planner.mjs`, delegating to the existing `SprintEngine` instance methods.
- **Status:** OPEN

## Resolved Blockers

_None yet._
