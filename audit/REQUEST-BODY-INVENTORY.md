# Request Body Inventory (Research Only) — Exhaustive

Covers all daemon/routes/\*.mjs handlers reading req.body. Includes middleware, auth, exact reads, per-property required/optional, throws with messages, implied types from usage, relevant req.params/req.query.

OpenAPI: `daemon/lib/openapi.mjs` defines schemas/requestBodies only (no runtime validation middleware).

## admin.mjs

### PATCH /api/v1/admin/users/:id/role

- **File:** `/Users/mac/nokta/daemon/routes/admin.mjs`
- **HTTP:** PATCH /api/v1/admin/users/:id/role
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { role } = req.body;`
- **Property analysis:**
  - `role`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const { id } = req.params;`

### PATCH /api/v1/admin/users/:id/tier

- **File:** `/Users/mac/nokta/daemon/routes/admin.mjs`
- **HTTP:** PATCH /api/v1/admin/users/:id/tier
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { tier } = req.body;`
- **Property analysis:**
  - `tier`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const { id } = req.params;`

## adversarial.mjs

### POST /api/v1/adversarial/critique

- **File:** `/Users/mac/nokta/daemon/routes/adversarial.mjs`
- **HTTP:** POST /api/v1/adversarial/critique
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, file, target, provider, model } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `file`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `provider`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `model`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/adversarial/review

- **File:** `/Users/mac/nokta/daemon/routes/adversarial.mjs`
- **HTTP:** POST /api/v1/adversarial/review
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, file, target, provider, model, maxRounds } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `file`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `provider`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `model`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `maxRounds`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## agent-runs.mjs

### POST /api/v1/agent-runs

- **File:** `/Users/mac/nokta/daemon/routes/agent-runs.mjs`
- **HTTP:** POST /api/v1/agent-runs
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { goal, steps, provider, model, trigger, metadata, draft } = req.body;`
- **Property analysis:**
  - `goal`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `steps`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `provider`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `model`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `trigger`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `metadata`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `draft`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/agent-runs/auto

- **File:** `/Users/mac/nokta/daemon/routes/agent-runs.mjs`
- **HTTP:** POST /api/v1/agent-runs/auto
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { goal, metadata } = req.body;`
- **Property analysis:**
  - `goal`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `metadata`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/agent-runs/generate

- **File:** `/Users/mac/nokta/daemon/routes/agent-runs.mjs`
- **HTTP:** POST /api/v1/agent-runs/generate
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { goal, metadata } = req.body;`
- **Property analysis:**
  - `goal`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `metadata`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## agents.mjs

### POST /api/v1/agents/:id/execute

- **File:** `/Users/mac/nokta/daemon/routes/agents.mjs`
- **HTTP:** POST /api/v1/agents/:id/execute
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { goal } = req.body || {};`
- **Property analysis:**
  - `goal`: optional (req.body defaulted with ||); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const pack = resolveAgentPack(req.params.id, packs);`
  - `if (!pack) throw new AppError(`Agent not found: ${req.params.id}`, 404);`

### POST /api/v1/agents/recommend

- **File:** `/Users/mac/nokta/daemon/routes/agents.mjs`
- **HTTP:** POST /api/v1/agents/recommend
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { prompt } = req.body;`
- **Property analysis:**
  - `prompt`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## auth.mjs

### POST /api/v1/auth/login

- **File:** `/Users/mac/nokta/daemon/routes/auth.mjs`
- **HTTP:** POST /api/v1/auth/login
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { email, password } = req.body;`
- **Property analysis:**
  - `email`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `password`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/auth/logout

- **File:** `/Users/mac/nokta/daemon/routes/auth.mjs`
- **HTTP:** POST /api/v1/auth/logout
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { currentPassword, newPassword } = req.body;`
- **Property analysis:**
  - `currentPassword`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `newPassword`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/auth/register

- **File:** `/Users/mac/nokta/daemon/routes/auth.mjs`
- **HTTP:** POST /api/v1/auth/register
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { email, password, name } = req.body;`
- **Property analysis:**
  - `email`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `password`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `name`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## billing.mjs

### POST /api/v1/billing/portal

- **File:** `/Users/mac/nokta/daemon/routes/billing.mjs`
- **HTTP:** POST /api/v1/billing/portal
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `return_url: req.body.returnUrl || `${req.headers.origin}/settings`,`
- **Property analysis:**
  - (non-destructuring): `return_url: req.body.returnUrl || `${req.headers.origin}/settings`,`

### POST /api/v1/billing/upgrade

- **File:** `/Users/mac/nokta/daemon/routes/billing.mjs`
- **HTTP:** POST /api/v1/billing/upgrade
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { tier = 'pro' } = req.body;`
  - `success_url: req.body.successUrl || `${req.headers.origin}/?billing=success`,`
  - `cancel_url: req.body.cancelUrl || `${req.headers.origin}/?billing=cancel`,`
- **Property analysis:**
  - `tier`: optional (has default in destructuring); implied type: string
  - (non-destructuring): `success_url: req.body.successUrl || `${req.headers.origin}/?billing=success`,`
  - (non-destructuring): `cancel_url: req.body.cancelUrl || `${req.headers.origin}/?billing=cancel`,`

## brain.mjs

### PATCH /api/v1/brain/dna

- **File:** `/Users/mac/nokta/daemon/routes/brain.mjs`
- **HTTP:** PATCH /api/v1/brain/dna
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { dna } = req.body;`
- **Property analysis:**
  - `dna`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/brain/patterns

- **File:** `/Users/mac/nokta/daemon/routes/brain.mjs`
- **HTTP:** POST /api/v1/brain/patterns
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { rule, example } = req.body;`
- **Property analysis:**
  - `rule`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `example`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## chat.mjs

### POST /api/v1/chat

- **File:** `/Users/mac/nokta/daemon/routes/chat.mjs`
- **HTTP:** POST /api/v1/chat
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `} = req.body;`
- **Property analysis:**
  - (non-destructuring): `} = req.body;`

## code-actions.mjs

### POST /api/v1/code-actions/explain

- **File:** `/Users/mac/nokta/daemon/routes/code-actions.mjs`
- **HTTP:** POST /api/v1/code-actions/explain
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, language } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `language`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/code-actions/fix-errors

- **File:** `/Users/mac/nokta/daemon/routes/code-actions.mjs`
- **HTTP:** POST /api/v1/code-actions/fix-errors
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, language, errors } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `language`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `errors`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/code-actions/generate-tests

- **File:** `/Users/mac/nokta/daemon/routes/code-actions.mjs`
- **HTTP:** POST /api/v1/code-actions/generate-tests
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, language, testFramework } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `language`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `testFramework`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/code-actions/refactor

- **File:** `/Users/mac/nokta/daemon/routes/code-actions.mjs`
- **HTTP:** POST /api/v1/code-actions/refactor
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, language, suggestion } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `language`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `suggestion`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## complete.mjs

### POST /api/v1/chat/complete

- **File:** `/Users/mac/nokta/daemon/routes/complete.mjs`
- **HTTP:** POST /api/v1/chat/complete
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { prompt, context = [], model, maxTokens, temperature } = req.body;`
- **Property analysis:**
  - `prompt`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `context`: optional (has default in destructuring); implied type: array
  - `model`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `maxTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `temperature`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## context.mjs

### POST /api/v1/context

- **File:** `/Users/mac/nokta/daemon/routes/context.mjs`
- **HTTP:** POST /api/v1/context
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target, task, adapter = 'codex', budget = 6000 } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `task`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `adapter`: optional (has default in destructuring); implied type: string
  - `budget`: optional (has default in destructuring); implied type: number

### POST /api/v1/detect

- **File:** `/Users/mac/nokta/daemon/routes/context.mjs`
- **HTTP:** POST /api/v1/detect
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## costs.mjs

### POST /api/v1/costs/estimate

- **File:** `/Users/mac/nokta/daemon/routes/costs.mjs`
- **HTTP:** POST /api/v1/costs/estimate
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { model, inputTokens, outputTokens } = req.body;`
- **Property analysis:**
  - `model`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `inputTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `outputTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## fleet.mjs

### POST /api/v1/fleet

- **File:** `/Users/mac/nokta/daemon/routes/fleet.mjs`
- **HTTP:** POST /api/v1/fleet
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { project, provider = 'opencode', pid, port, cwd } = req.body || {};`
- **Property analysis:**
  - `project`: optional (req.body defaulted with ||); implied type: unknown
  - `provider`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
  - `pid`: optional (req.body defaulted with ||); implied type: unknown
  - `port`: optional (req.body defaulted with ||); implied type: unknown
  - `cwd`: optional (req.body defaulted with ||); implied type: unknown

### POST /api/v1/fleet/:project/plan

- **File:** `/Users/mac/nokta/daemon/routes/fleet.mjs`
- **HTTP:** POST /api/v1/fleet/:project/plan
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { prompt, provider = 'opencode' } = req.body || {};`
- **Property analysis:**
  - `prompt`: optional (req.body defaulted with ||); implied type: unknown
  - `provider`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
- **req.params / req.query feeding body-like action:**
  - `const plan = await fleet.plan(req.params.project, prompt, { provider });`

### POST /api/v1/fleet/:project/run

- **File:** `/Users/mac/nokta/daemon/routes/fleet.mjs`
- **HTTP:** POST /api/v1/fleet/:project/run
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { prompt, provider = 'opencode', timeoutMs } = req.body || {};`
- **Property analysis:**
  - `prompt`: optional (req.body defaulted with ||); implied type: unknown
  - `provider`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
  - `timeoutMs`: optional (req.body defaulted with ||); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const result = await fleet.run(req.params.project, prompt, {`

## gates.mjs

### POST /api/v1/gates

- **File:** `/Users/mac/nokta/daemon/routes/gates.mjs`
- **HTTP:** POST /api/v1/gates
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target, messages = [] } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `messages`: optional (has default in destructuring); implied type: array

### POST /api/v1/gates/check-security

- **File:** `/Users/mac/nokta/daemon/routes/gates.mjs`
- **HTTP:** POST /api/v1/gates/check-security
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { messages } = req.body;`
- **Property analysis:**
  - `messages`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/gates/check-token

- **File:** `/Users/mac/nokta/daemon/routes/gates.mjs`
- **HTTP:** POST /api/v1/gates/check-token
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { messages, estimatedTokens } = req.body;`
- **Property analysis:**
  - `messages`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `estimatedTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### PUT /api/v1/gates/config

- **File:** `/Users/mac/nokta/daemon/routes/gates.mjs`
- **HTTP:** PUT /api/v1/gates/config
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { tokenLimit, severity } = req.body;`
- **Property analysis:**
  - `tokenLimit`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `severity`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/gates/evaluate

- **File:** `/Users/mac/nokta/daemon/routes/gates.mjs`
- **HTTP:** POST /api/v1/gates/evaluate
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { messages, estimatedTokens } = req.body;`
- **Property analysis:**
  - `messages`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `estimatedTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## mcp.mjs

### POST /api/v1/mcp/execute

- **File:** `/Users/mac/nokta/daemon/routes/mcp.mjs`
- **HTTP:** POST /api/v1/mcp/execute
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { serverId, toolName, args, target } = req.body;`
- **Property analysis:**
  - `serverId`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `toolName`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `args`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/mcp/servers

- **File:** `/Users/mac/nokta/daemon/routes/mcp.mjs`
- **HTTP:** POST /api/v1/mcp/servers
- **Middleware chain:** `authMiddleware(true)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { target, servers } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `servers`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## planner.mjs

### POST /api/v1/planner/auto-prioritize

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/auto-prioritize
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { recentChanges, deadlines } = req.body || {};`
- **Property analysis:**
  - `recentChanges`: optional (req.body defaulted with ||); implied type: unknown
  - `deadlines`: optional (req.body defaulted with ||); implied type: unknown

### POST /api/v1/planner/brainstorm

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/brainstorm
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { context, prompts } = req.body;`
- **Property analysis:**
  - `context`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `prompts`: required (guarded: throws AppError('prompts.features is required for brainstorming', 400) when falsy); implied type: unknown

### POST /api/v1/planner/epics

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/epics
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const epic = await sprintEngine.createEpic(req.body);`
- **Property analysis:**
  - (non-destructuring): `const epic = await sprintEngine.createEpic(req.body);`

### PATCH /api/v1/planner/epics/:epicId

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** PATCH /api/v1/planner/epics/:epicId
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const updates = req.body;`
- **Property analysis:**
  - (non-destructuring): `const updates = req.body;`
- **req.params / req.query feeding body-like action:**
  - `const { epicId } = req.params;`

### POST /api/v1/planner/initiatives

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/initiatives
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const initiative = await sprintEngine.createInitiative(req.body);`
- **Property analysis:**
  - (non-destructuring): `const initiative = await sprintEngine.createInitiative(req.body);`

### POST /api/v1/planner/items

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/items
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const item = await sprintEngine.createItem(req.body);`
- **Property analysis:**
  - (non-destructuring): `const item = await sprintEngine.createItem(req.body);`

### PATCH /api/v1/planner/items/:itemId

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** PATCH /api/v1/planner/items/:itemId
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const updates = req.body;`
- **Property analysis:**
  - (non-destructuring): `const updates = req.body;`
- **req.params / req.query feeding body-like action:**
  - `const { itemId } = req.params;`

### POST /api/v1/planner/items/:itemId/feedback

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/items/:itemId/feedback
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { action } = req.body;`
- **Property analysis:**
  - `action`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const { itemId } = req.params;`

### POST /api/v1/planner/items/:itemId/link-decision/:decisionId

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/items/:itemId/link-decision/:decisionId
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { relationship } = req.body;`
- **Property analysis:**
  - `relationship`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const { itemId, decisionId } = req.params;`

### POST /api/v1/planner/sprints

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/sprints
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const sprint = await sprintEngine.createSprint(req.body);`
- **Property analysis:**
  - (non-destructuring): `const sprint = await sprintEngine.createSprint(req.body);`

### PATCH /api/v1/planner/sprints/:sprintId

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** PATCH /api/v1/planner/sprints/:sprintId
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const updates = req.body;`
- **Property analysis:**
  - (non-destructuring): `const updates = req.body;`
- **req.params / req.query feeding body-like action:**
  - `const { sprintId } = req.params;`

### POST /api/v1/planner/sprints/:sprintId/items

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/sprints/:sprintId/items
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { itemIds } = req.body;`
- **Property analysis:**
  - `itemIds`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: array
- **req.params / req.query feeding body-like action:**
  - `const { sprintId } = req.params;`

### POST /api/v1/planner/sprints/:sprintId/items/remove

- **File:** `/Users/mac/nokta/daemon/routes/planner.mjs`
- **HTTP:** POST /api/v1/planner/sprints/:sprintId/items/remove
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { itemIds } = req.body;`
- **Property analysis:**
  - `itemIds`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: array
- **req.params / req.query feeding body-like action:**
  - `const { sprintId } = req.params;`

## projects.mjs

### POST /api/v1/projects

- **File:** `/Users/mac/nokta/daemon/routes/projects.mjs`
- **HTTP:** POST /api/v1/projects
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { name, rootPath, techStack = 'unknown' } = req.body;`
- **Property analysis:**
  - `name`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `rootPath`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `techStack`: optional (has default in destructuring); implied type: string

## providers.mjs

### PATCH /api/v1/providers/:id

- **File:** `/Users/mac/nokta/daemon/routes/providers.mjs`
- **HTTP:** PATCH /api/v1/providers/:id
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { apiKey, baseUrl, models, enabled, maxTokens, temperature } = req.body;`
- **Property analysis:**
  - `apiKey`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `baseUrl`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `models`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `enabled`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `maxTokens`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `temperature`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
- **req.params / req.query feeding body-like action:**
  - `const { id } = req.params;`

### POST /api/v1/providers/auto-route

- **File:** `/Users/mac/nokta/daemon/routes/providers.mjs`
- **HTTP:** POST /api/v1/providers/auto-route
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { enabled } = req.body;`
- **Property analysis:**
  - `enabled`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/providers/configure

- **File:** `/Users/mac/nokta/daemon/routes/providers.mjs`
- **HTTP:** POST /api/v1/providers/configure
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { id, apiKey, baseUrl, models, enabled } = req.body;`
- **Property analysis:**
  - `id`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `apiKey`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `baseUrl`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `models`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `enabled`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/providers/default

- **File:** `/Users/mac/nokta/daemon/routes/providers.mjs`
- **HTTP:** POST /api/v1/providers/default
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { id } = req.body;`
- **Property analysis:**
  - `id`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## sandbox.mjs

### POST /api/v1/sandbox/exec

- **File:** `/Users/mac/nokta/daemon/routes/sandbox.mjs`
- **HTTP:** POST /api/v1/sandbox/exec
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { code, fileName, timeoutMs, memoryLimit } = req.body;`
- **Property analysis:**
  - `code`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `fileName`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `timeoutMs`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `memoryLimit`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/sandbox/exec-file

- **File:** `/Users/mac/nokta/daemon/routes/sandbox.mjs`
- **HTTP:** POST /api/v1/sandbox/exec-file
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { file, target, timeoutMs, memoryLimit } = req.body;`
- **Property analysis:**
  - `file`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `timeoutMs`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `memoryLimit`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## search.mjs

### POST /api/v1/search

- **File:** `/Users/mac/nokta/daemon/routes/search.mjs`
- **HTTP:** POST /api/v1/search
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { query, target, maxResults = 20, dir, ext, regex } = req.body;`
- **Property analysis:**
  - `query`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `maxResults`: optional (has default in destructuring); implied type: number
  - `dir`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `ext`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `regex`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/search/semantic

- **File:** `/Users/mac/nokta/daemon/routes/search.mjs`
- **HTTP:** POST /api/v1/search/semantic
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { query, target, maxResults = 20 } = req.body;`
- **Property analysis:**
  - `query`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `maxResults`: optional (has default in destructuring); implied type: number

## skill-evolution.mjs

### POST /api/v1/skills/synthesize

- **File:** `/Users/mac/nokta/daemon/routes/skill-evolution.mjs`
- **HTTP:** POST /api/v1/skills/synthesize
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { sources } = req.body;`
- **Property analysis:**
  - `sources`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## skills.mjs

### POST /api/v1/skills/import

- **File:** `/Users/mac/nokta/daemon/routes/skills.mjs`
- **HTTP:** POST /api/v1/skills/import
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { url } = req.body || {};`
- **Property analysis:**
  - `url`: optional (req.body defaulted with ||); implied type: unknown

### POST /api/v1/skills/scan

- **File:** `/Users/mac/nokta/daemon/routes/skills.mjs`
- **HTTP:** POST /api/v1/skills/scan
- **Middleware chain:** `authMiddleware()`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { url } = req.body || {};`
- **Property analysis:**
  - `url`: optional (req.body defaulted with ||); implied type: unknown

## trail.mjs

### POST /api/v1/trail/resume

- **File:** `/Users/mac/nokta/daemon/routes/trail.mjs`
- **HTTP:** POST /api/v1/trail/resume
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target, sessionId } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `sessionId`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

### POST /api/v1/trail/start

- **File:** `/Users/mac/nokta/daemon/routes/trail.mjs`
- **HTTP:** POST /api/v1/trail/start
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target, task, agent } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `task`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `agent`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: number

### PUT /api/v1/trail/update

- **File:** `/Users/mac/nokta/daemon/routes/trail.mjs`
- **HTTP:** PUT /api/v1/trail/update
- **Middleware chain:** `(none)`
- **Auth (POST/PUT/PATCH):** False
- **Exact req.body reads:**
  - `const { target, sessionFile, content } = req.body;`
- **Property analysis:**
  - `target`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `sessionFile`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown
  - `content`: required (no default in destructuring; no visible guard throwing AppError for it); implied type: unknown

## uiux.mjs

### POST /api/v1/uiux/component-suggestions

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/component-suggestions
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { functionality, platform = 'web', preferences = {}, includeAccessibility = true } = req.body || {};`
  - `log.error('UI component suggestions failed', { error: err.message, body: req.body });`
- **Property analysis:**
  - (non-destructuring): `const { functionality, platform = 'web', preferences = {}, includeAccessibility = true } = req.body || {};`
  - (non-destructuring): `log.error('UI component suggestions failed', { error: err.message, body: req.body });`

### POST /api/v1/uiux/design-system

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/design-system
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { query, projectName = 'My Project', format = 'markdown', persist = false, includeExamples = true } = req.body || {};`
- **Property analysis:**
  - `query`: optional (req.body defaulted with ||); implied type: unknown
  - `projectName`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
  - `format`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
  - `persist`: optional (has default in destructuring; req.body defaulted with ||); implied type: boolean
  - `includeExamples`: optional (has default in destructuring; req.body defaulted with ||); implied type: boolean

### POST /api/v1/uiux/design-system-templates

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/design-system-templates
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { templateType, platform = 'web' } = req.body || {};`
- **Property analysis:**
  - `templateType`: optional (req.body defaulted with ||); implied type: unknown
  - `platform`: optional (has default in destructuring; req.body defaulted with ||); implied type: string

### POST /api/v1/uiux/metrics

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/metrics
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { timeframe = '30d', metricTypes = [] } = req.body || {};`
- **Property analysis:**
  - `timeframe`: optional (has default in destructuring; req.body defaulted with ||); implied type: string
  - `metricTypes`: optional (has default in destructuring; req.body defaulted with ||); implied type: array

### POST /api/v1/uiux/recommendations

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/recommendations
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { itemId, featureDescription, projectContext } = req.body || {};`
  - `log.error('UI/UX recommendations failed', { error: err.message, body: req.body });`
- **Property analysis:**
  - `itemId`: optional (req.body defaulted with ||); implied type: unknown
  - `featureDescription`: optional (req.body defaulted with ||); implied type: unknown
  - `projectContext`: optional (req.body defaulted with ||); implied type: unknown
  - (non-destructuring): `log.error('UI/UX recommendations failed', { error: err.message, body: req.body });`

### POST /api/v1/uiux/search

- **File:** `/Users/mac/nokta/daemon/routes/uiux.mjs`
- **HTTP:** POST /api/v1/uiux/search
- **Middleware chain:** `authMiddleware(false)`
- **Auth (POST/PUT/PATCH):** True
- **Exact req.body reads:**
  - `const { query, domain, stack, limit = 3, category } = req.body || {};`
- **Property analysis:**
  - `query`: optional (req.body defaulted with ||); implied type: unknown
  - `domain`: optional (req.body defaulted with ||); implied type: unknown
  - `stack`: optional (req.body defaulted with ||); implied type: unknown
  - `limit`: optional (has default in destructuring; req.body defaulted with ||); implied type: number
  - `category`: optional (req.body defaulted with ||); implied type: unknown
