# Task Packet Specification

## Structure

Each task packet contains:

### PHASE 1: DISCOVERY
- Evidence collection (file reads, test output, logs)
- Stack detection results
- Constraint identification

### PHASE 2: SPECIFICATION
- Objective statement
- Scope (in/out)
- Acceptance criteria
- Risk assessment

### PHASE 3: EXECUTION
- Implementation plan
- File changes needed
- Test plan

### PHASE 4: VERIFICATION
- Lint pass
- Test pass (all tests green)
- Health check pass
- Gate evaluation

## Priority Levels

| Level | Meaning |
|---|---|
| P0 | Blocker — must fix before any progress |
| P1 | Critical — core functionality |
| P2 | High — important but not blocking |
| P3 | Medium — nice to have |
| P4 | Low — future enhancement |

## Status Values

`TRIGGERED → DISCOVERING → TRIAGING → SPECIFYING → RESEARCHING → PLANNING → DELEGATING → EXECUTING → VERIFYING → REVIEWING → RECONCILING → DOCUMENTING → PERSISTING → SELECTING_NEXT`

Terminal: `DONE, BLOCKED_*, WAITING_*, RATE_LIMITED, BUDGET_EXHAUSTED, PAUSED, CANCELLED`
