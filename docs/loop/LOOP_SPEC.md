# Nokta Loop Protocol Specification

## Loop Lifecycle

The autonomous loop protocol for Nokta follows these phases:

### 1. TRIGGERED
- **Entry point:** User request, file change, scheduled task, or agent auto-run
- **Output:** Loop initialization, context loading begins
- **Transition:** → DISCOVERING

### 2. DISCOVERING
- **Actions:**
  - Scan project structure
  - Detect tech stack (detect.mjs)
  - Read active trail session
  - Identify recent git changes
  - Load relevant context packs
  - Check for design/UI-UX considerations
  - Check for architectural decision context
- **Output:** Project context, stack signals, relevant files, constraints
- **Transition:** → TRIAGING

### 3. TRIAGING
- **Actions:**
  - Assess task type (bug fix, feature, refactor, etc.)
  - Identify risk level (low, medium, high)
  - Determine scope (files, subsystems)
  - Check for blocking issues (missing deps, config issues)
- **Output:** Task classification, risk assessment, scope boundaries
- **Transition:** → SPECIFYING

### 4. SPECIFYING
- **Actions:**
  - Define objective clearly
  - List in-scope and out-of-scope items
  - Identify acceptance criteria
  - Create test plan outline
  - Define success criteria
  - Check trail gates preflight
- **Output:** Task specification, acceptance criteria
- **Transition:** → RESEARCHING

### 5. RESEARCHING
- **Actions:**
  - Read relevant source files
  - Check existing patterns and conventions
  - Search documentation
  - Review similar past implementations
  - Query design intelligence (UI/UX Pro Max)
  - Query architectural decisions
- **Output:** Evidence collection, design guidelines, architectural context
- **Transition:** → PLANNING

### 6. PLANNING
- **Actions:**
  - Break down into concrete steps
  - Estimate each step (story points)
  - Auto-prioritize tasks (deps, deadlines, code health)
  - Identify test strategy
  - Draft implementation approach
- **Output:** Implementation plan, ordered task list with estimates
- **Transition:** → DELEGATING

### 7. DELEGATING
- **Actions:**
  - For autonomous mode: create agent run with goal-oriented steps
  - For directive mode: assign to specific agent role
  - Pass context (compiled context, trail, design guidelines)
- **Output:** Agent run created, context passed
- **Transition:** → EXECUTING

### 8. EXECUTING
- **Actions:**
  - Write tests first (TDD)
  - Implement changes (smallest coherent change)
  - Preserve unrelated user changes
  - Apply design intelligence recommendations
  - Follow architectural decisions
- **Output:** Code changes, test files
- **Transition:** → VERIFYING

### 9. VERIFYING
- **Actions:**
  - Run lint (`npm run lint`)
  - Run tests (`npm run test:ci`)
  - Run trail gates (`nokta gates .`)
  - Check health endpoint
  - Validate against acceptance criteria
  - Visual verification for UI work
- **Output:** Verification results, pass/fail status
- **Transition:** → REVIEWING

### 10. REVIEWING
- **Actions:**
  - Code review via `code-reviewer` agent
  - Security review via `security-reviewer` agent
  - Check for hardcoded secrets
  - Verify input validation
  - Ensure error handling
- **Output:** Review feedback, residual risk assessment
- **Transition:** → RECONCILING

### 11. RECONCILING
- **Actions:**
  - Address review feedback
  - Fix any identified issues
  - Re-run verification if changes made
  - Update task status in sprint engine
- **Output:** Resolved feedback, final code state
- **Transition:** → DOCUMENTING

### 12. DOCUMENTING
- **Actions:**
  - Update active trail session
  - Record decisions made
  - Document evidence read
  - Record risks and blockers
  - Write handoff summary
  - Record lessons learned in self-learning system
- **Output:** Updated trail, documentation
- **Transition:** → PERSISTING

### 13. PERSISTING
- **Actions:**
  - Save state to `.nokta/` directory
  - Update learned patterns from feedback
  - Update decision engine with new decisions
  - Commit changes if autonomous mode
  - Trigger auto-watcher for next iteration
- **Output:** Persisted state, ready for next loop
- **Transition:** → SELECTING_NEXT

### 14. SELECTING_NEXT
- **Actions:**
  - Check for more work (backlog items, file changes, feedback)
  - Prioritize next task
  - Start next loop iteration
- **Terminal outputs:**
  - `DONE` — No more work, loop complete
  - `BLOCKED_*` — Blocked by dependency or resource issue
  - `WAITING_*` — Waiting on user input or external system
  - `RATE_LIMITED` — Hit rate limit on AI provider
  - `BUDGET_EXHAUSTED` — Token/day budget exhausted
  - `PAUSED` — User paused the loop
  - `CANCELLED` — User cancelled

## Hard Gates

Each loop must pass these gates before transitioning:

| Gate | When | Must Pass Before |
|---|---|---|
| **Preflight Gate** | Phase 2 | PLANNING |
| **Evidence Gate** | Phases 2-3 | EXECUTING |
| **Mutation Gate** | Phase 7 | EXECUTING |
| **Token Gate** | All phases | All transitions |
| **Security Gate** | Phases 6-7 | COMMIT/PR |
| **Verification Gate** | Phase 9 | DOCUMENTING |
| **Trail Gate** | Phase 12 | SELECTING_NEXT |

## Agent Model Routing

| Tier | Model | Use For |
|---|---|---|
| Orchestrator | mimo-v2.5-free | CEO, Chief of Staff |
| Senior Architecture | nemotron-3-ultra-free | CTO, Security, Reviewer, Database |
| Implementation | deepseek-v4-flash-free | Frontend, Backend, QA, DevOps |
| Fast Worker | north-mini-code-free | Tech Writer, Repo Archaeologist |

**Separation of Duties:** Executor and verifier MUST use different models.
