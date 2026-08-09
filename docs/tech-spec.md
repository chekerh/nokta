# Nokta Technical Specification: The Symmetry OS

## 1. System Architecture: The Proxy-First Model

Nokta operates as a **Local LLM Gateway**. Every LLM request from any IDE flows through Nokta, which enriches, monitors, and controls the interaction.

### 1.1 The Gateway Pipeline

```
IDE Request
    ↓
[Nokta Proxy] ← Auth Middleware (JWT/Bearer)
    ↓
[Context Assembler] ← User Brain + Domain Guardrails + Project Context
    ↓
[Token Optimizer] ← Relevance Scoring + Noise Stripping + Budget Check
    ↓
[Provider Router] ← Select provider based on cost/availability/model
    ↓
[LLM Provider API] ← OpenAI / Anthropic / Google / Local
    ↓
[Response Filter] ← SecOps Scan + Loop Detection + Cost Logging
    ↓
IDE Response
```

### 1.2 The Context Assembler (Symmetry Engine)

The Assembler builds the prompt using three layers of intelligence:

| Layer                     | Source                       | Content                                                                      | Injection Point      |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| **L0: Global User DNA**   | `user_brain.operational_dna` | Core preferences, naming conventions, learned patterns from all projects     | System prompt prefix |
| **L1: Domain Guardrails** | `skills/` directory          | Best practices for the detected stack (e.g., "The Security standard for Go") | System prompt body   |
| **L2: Project Context**   | `.nokta/` + file analysis    | Compiled project map, current task, relevant file snippets                   | User message prefix  |

**Priority Order:** L0 > L1 > L2 (User DNA always wins)

### 1.3 The Token Optimizer (Pruning Logic)

To prevent context window saturation:

| Technique             | Description                                                                              | Implementation                                       |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Relevance Scoring** | Only inject "Learned Patterns" that match the current file's keywords.                   | Keyword matching against `learned_patterns[].domain` |
| **Noise Stripping**   | Remove boilerplate, repetitive comments, and unnecessary metadata.                       | Regex-based stripping + AST analysis                 |
| **Capped Sizing**     | Implement a "Token Budget" per request. Prioritize DNA → Project Context → Domain Rules. | Token counting + truncation                          |
| **Deduplication**     | Remove duplicate context from overlapping sources.                                       | Content hashing                                      |
| **Lazy Loading**      | Only load full project context when explicitly needed.                                   | On-demand file reading                               |

### 1.4 The Response Filter

After receiving the LLM response:

| Filter             | Purpose                                         | Action on Failure                              |
| ------------------ | ----------------------------------------------- | ---------------------------------------------- |
| **SecOps Scanner** | Detect secrets, vulnerabilities, anti-patterns. | Block response, log violation.                 |
| **Loop Detector**  | Identify "Fix-Break-Fix" cycles.                | Force "Reflection" step, halt autonomous loop. |
| **Cost Logger**    | Track tokens and cost per request.              | Update `cost_logs` table.                      |
| **Quality Gate**   | Check response against quality metrics.         | Flag for review if below threshold.            |

---

## 2. The Omni-Brain Data Model

### 2.1 User Brain Schema (`user_brain` table)

```sql
CREATE TABLE user_brain (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    operational_dna TEXT NOT NULL DEFAULT '[]',      -- JSON array of global rules
    design_preferences TEXT NOT NULL DEFAULT '{}',    -- JSON map of colors, fonts, styles
    learned_patterns TEXT NOT NULL DEFAULT '[]',      -- JSON array of extracted patterns
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`operational_dna` Structure:**

```json
[
  {
    "id": "dna-001",
    "rule": "Always use TypeScript strict mode",
    "example": "tsconfig.json: { \"strict\": true }",
    "domain": "typescript",
    "confidence": 0.95,
    "source": "learned",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

**`learned_patterns` Structure:**

```json
[
  {
    "id": "pat-001",
    "rule": "Use Result type instead of throwing exceptions",
    "example": "type Result<T> = { ok: true; value: T } | { ok: false; error: Error }",
    "domain": "typescript",
    "confidence": 0.85,
    "trigger": "user_edited_ai_code",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

**`design_preferences` Structure:**

```json
{
  "color_scheme": "dark",
  "primary_color": "#2563EB",
  "font_family": "Inter",
  "component_library": "shadcn/ui",
  "style_keywords": ["minimalism", "glassmorphism"],
  "anti_patterns": ["neumorphism", "skeuomorphism"]
}
```

### 2.2 Project Registry (`projects` table)

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    tech_stack TEXT,           -- JSON array of detected technologies
    active_status INTEGER NOT NULL DEFAULT 1,
    assigned_port INTEGER,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.3 Sprint Items (`sprint_items` table)

```sql
CREATE TABLE sprint_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT,
    project_root TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,          -- story, task, bug, subtask
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'P2',  -- P0-P4
    status TEXT NOT NULL DEFAULT 'backlog',  -- backlog, ready, in-progress, review, done, cancelled
    sprint_id TEXT,
    epic_id TEXT,
    initiative_id TEXT,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    related_files TEXT,          -- JSON array of file paths
    evidence TEXT,               -- Why this item exists
    dependencies TEXT,           -- JSON array of dependency IDs
    labels TEXT,                 -- JSON array of labels
    storyPoints INTEGER,
    assignee TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 3. The Autonomous Execution Engine (Sleep Loop)

### 3.1 Job Queue & Concurrency

| Parameter       | Default | Description                             |
| --------------- | ------- | --------------------------------------- |
| `concurrency`   | 2       | Maximum simultaneous agent runs         |
| `retryAttempts` | 3       | Number of retries on failure            |
| `retryDelayMs`  | 5000    | Delay between retries                   |
| `timeoutMs`     | 300000  | Maximum execution time per step (5 min) |

**Priority Queue Formula:**

```
Priority Score = (Priority × Urgency) / EstimatedTokens
```

Where:

- Priority: P0=5, P1=4, P2=3, P3=2, P4=1
- Urgency: Time-based decay factor
- EstimatedTokens: Predicted token cost of the task

### 3.2 The Sentinel (Loop Detection)

The Sentinel monitors agent execution for pathological patterns:

| Pattern           | Detection                                         | Response                              |
| ----------------- | ------------------------------------------------- | ------------------------------------- |
| **Fix-Break-Fix** | Same error appears 3+ times with same fix attempt | Halt agent, trigger "Reflection" step |
| **Infinite Loop** | Same step output repeated 5+ times                | Halt agent, log warning               |
| **Cost Runaway**  | Token cost exceeds project limit                  | Halt agent, notify user               |
| **Time Runaway**  | Execution time exceeds timeout                    | Kill agent process, log error         |

### 3.3 The "Self-Healing" Pipeline

```
Watcher detects change
    ↓
Planner generates steps (LLM-based)
    ↓
Executor runs steps sequentially
    ↓
Verification Gate (lint, test, typecheck)
    ↓
├── Pass → PR Creator → Done
└── Fail → Reflection (LLM analyzes failure)
         ↓
    Executor re-runs with fixes
         ↓
    Verification Gate (retry)
         ↓
    ├── Pass → PR Creator → Done
    └── Fail (3rd time) → Halt, notify user
```

### 3.4 Step Execution Details

**`prompt` Step:**

```javascript
{
  type: 'prompt',
  name: 'Analyze code for vulnerabilities',
  messages: [
    { role: 'user', content: 'Analyze this code for SQL injection vulnerabilities...' }
  ],
  systemPrompt: 'You are a security expert. Be specific about vulnerabilities.',
  provider: 'anthropic',  // Optional: override default provider
  model: 'claude-sonnet-4-20250514'       // Optional: override default model
}
```

**`shell` Step:**

```javascript
{
  type: 'shell',
  name: 'Run tests',
  command: 'npm test 2>&1 | head -100',
  cwd: '/path/to/project',  // Optional: defaults to projectRoot
  timeout: 60000,            // Optional: default 30s
  ignoreFailure: true        // Optional: don't halt on non-zero exit
}
```

**`edit` Step:**

```javascript
{
  type: 'edit',
  name: 'Fix TypeScript error',
  file: 'src/utils.ts',      // Relative to project root
  content: 'export function formatDate(d: Date): string { ... }',
  oldString: 'export function formatDate(d) { ... }'  // Optional: replacement mode
}
```

**`review` Step:**

```javascript
{
  type: 'review',
  name: 'Review changes',
  branch: 'HEAD',            // Optional: default HEAD
  diff: '...'                // Optional: provide diff directly
}
```

**`pr` Step:**

```javascript
{
  type: 'pr',
  name: 'Create pull request',
  owner: 'username',
  repo: 'repository',
  title: 'Fix: SQL injection vulnerability',
  body: '## Changes\n- Parameterized all queries\n- Added input validation',
  head: 'fix/sql-injection',
  base: 'main'
}
```

**`condition` Step:**

```javascript
{
  type: 'condition',
  name: 'Check for changes',
  condition: 'git:hasChanges',  // or 'file:exists:package.json', 'env:GITHUB_TOKEN'
  failOnFalse: true             // Optional: default true
}
```

---

## 4. Network & Port Strategy (Multi-Project Mode)

### 4.1 Port Allocation

| Port Range | Purpose                    | Management         |
| ---------- | -------------------------- | ------------------ |
| 4217       | Master Daemon (fixed)      | Single instance    |
| 4000-4099  | Project dev servers        | Dynamic assignment |
| 4100-4199  | Agent sandbox environments | Isolated execution |
| 4200-4216  | Reserved for future use    | Reserved           |

### 4.2 Header-Based Routing

Every request to the Master Daemon includes:

```http
X-Nokta-Project-Id: proj-abc123
X-Nokta-User-Id: usr-xyz789
Authorization: Bearer <jwt-token>
```

The daemon routes to the correct `ProjectInstance` in memory.

### 4.3 Project Lifecycle

```
Project Registration
    ↓
Create ProjectInstance (in-memory)
    ↓
Initialize SprintEngine
    ↓
Initialize AgentOrchestrator
    ↓
Initialize AutoWatcher
    ↓
Start monitoring file changes
    ↓
Generate initial sprint items from codebase analysis
```

---

## 5. The Semantic Layer (Vector DB + RAG)

### 5.1 Embedding Pipeline

```
File Change Detected (AutoWatcher)
    ↓
Chunk Code (AST-aware splitting)
    ↓
Generate Embeddings (local model or API)
    ↓
Upsert to Vector DB (LanceDB/ChromaDB)
    ↓
Update Index Metadata
```

### 5.2 RAG Retrieval

```
User Query / Task Description
    ↓
Generate Query Embedding
    ↓
Vector Search (top-k results)
    ↓
Context Ranking (relevance + recency + importance)
    ↓
Inject into Context Assembler
```

### 5.3 Incremental Indexing

- Only re-indexes changed files (detected by AutoWatcher).
- Maintains a `file_hash → embedding` mapping.
- Batch upserts for efficiency (every 5 seconds).

---

## 6. The Adversarial Layer (Critic/Implementer)

### 6.1 Dual-Agent Architecture

```
Goal
    ↓
Implementer Agent
    ↓
Generate Code + Tests
    ↓
Critic Agent
    ↓
├── Approve → Continue to next step
└── Reject → Feedback to Implementer
         ↓
    Implementer re-generates with feedback
         ↓
    Critic re-reviews (max 3 rounds)
         ↓
    3rd rejection → Escalate to human
```

### 6.2 Critic Heuristics

| Category          | Check                                                           | Severity |
| ----------------- | --------------------------------------------------------------- | -------- |
| **Security**      | Hardcoded secrets, SQL injection, XSS                           | CRITICAL |
| **Performance**   | N+1 queries, unnecessary re-renders, memory leaks               | HIGH     |
| **Quality**       | Deep nesting (>4 levels), functions >50 lines, files >800 lines | MEDIUM   |
| **Style**         | Naming conventions, import order, formatting                    | LOW      |
| **Tests**         | Coverage <80%, missing edge cases                               | HIGH     |
| **Documentation** | Missing JSDoc, outdated comments                                | LOW      |

---

## 7. The Sandbox Layer (Isolated Execution)

### 7.1 Container Configuration

```yaml
# Docker sandbox config
image: node:22-slim
resources:
  limits:
    cpus: '2'
    memory: 512M
  reservations:
    cpus: '1'
    memory: 256M
network_mode: none # No network access
volumes:
  - /tmp/nokta-sandbox/workspace:/workspace # Ephemeral workspace
```

### 7.2 Execution Flow

```
Agent Step (shell type)
    ↓
Create Ephemeral Container
    ↓
Mount workspace as /workspace
    ↓
Execute command with resource limits
    ↓
Capture stdout/stderr
    ↓
Destroy container
    ↓
Return output to agent
```

---

## 8. The Evolution Layer (Skill Synthesis)

### 8.1 Pattern Detection

```
Agent Run Completed
    ↓
Analyze Step Sequence
    ↓
Identify Repeated Patterns (3+ successful uses)
    ↓
Extract Pattern Metadata (type, context, outcome)
    ↓
Generate Skill Definition
    ↓
Add to skills/ Directory
    ↓
Update Domain Capability Pack
```

### 8.2 Skill Definition Format

```json
{
  "name": "fix-sql-injection",
  "version": "1.0.0",
  "description": "Detect and fix SQL injection vulnerabilities",
  "trigger": "security-review identifies SQL injection risk",
  "steps": [
    {
      "type": "prompt",
      "content": "Analyze the code for SQL injection patterns..."
    },
    {
      "type": "edit",
      "content": "Replace string concatenation with parameterized queries..."
    }
  ],
  "confidence": 0.9,
  "usage_count": 5,
  "success_rate": 1.0,
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

## 9. Provider Manager

### 9.1 Supported Providers

| Provider  | Models                                     | Auth Method        |
| --------- | ------------------------------------------ | ------------------ |
| OpenAI    | gpt-4o, gpt-4o-mini, gpt-4-turbo           | API Key            |
| Anthropic | claude-sonnet-4-20250514, claude-3-5-haiku | API Key            |
| Google    | gemini-2.5-pro, gemini-2.5-flash           | API Key            |
| Ollama    | llama3, codellama, mistral                 | Local (no auth)    |
| Custom    | Any OpenAI-compatible endpoint             | API Key + Base URL |

### 9.2 Provider Selection Logic

```
Request arrives
    ↓
Check user's configured providers
    ↓
Filter by: enabled + balance > 0
    ↓
Rank by: cost_per_token × quality_score
    ↓
Select cheapest viable provider
    ↓
Route request
```

### 9.3 Fallback Chain

If primary provider fails:

1. Retry with same provider (1 attempt)
2. Switch to next viable provider
3. If all providers fail, return error to IDE

---

## 10. Rate Limiting (FinOps)

### 10.1 Tier Configuration

| Tier       | Requests/min | Daily Tokens | Monthly Cost |
| ---------- | ------------ | ------------ | ------------ |
| Free       | 10           | 100,000      | $5.00        |
| Pro        | 60           | 1,000,000    | $50.00       |
| Enterprise | 300          | 10,000,000   | $500.00      |

### 10.2 Token Bucket Algorithm

```
Bucket Size = Daily Token Limit
Refill Rate = Daily Token Limit / 86400 (per second)
Current Bucket = min(Bucket Size, Last Bucket - Consumed + Refill)

If Current Bucket < Request Cost:
    Reject with 429 Too Many Requests
Else:
    Consume tokens, process request
```

---

## 11. Database Migrations

### v1: Initial Schema

- `users`: User accounts with tier management
- `sessions`: JWT session storage
- `provider_keys`: Encrypted API key storage
- `cost_logs`: Token usage tracking
- `agent_runs`: Autonomous execution tracking
- `agent_run_steps`: Individual step results
- `sprint_items`: Project management items
- `user_configs`: Per-user configuration

### v2: Multi-Project + User Brain

- `projects`: Multi-project registry
- `user_brain`: Developer operational DNA

### Future Migrations

- v3: Vector embeddings table
- v4: Skill registry table
- v5: Audit trail table

---

## 12. Testing Strategy

### 12.1 Test Types

| Type              | Coverage Target | Tools                        |
| ----------------- | --------------- | ---------------------------- |
| Unit Tests        | 80%+            | Node.js test runner          |
| Integration Tests | 70%+            | Supertest + SQLite in-memory |
| E2E Tests         | Critical flows  | Playwright                   |

### 12.2 Test Commands

```bash
# Run all tests
npm test

# Run specific test file
node tests/lib/utils.test.js

# Run with coverage
npm run test:coverage
```

### 12.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run typecheck
```

---

## 13. Security Specifications

### 13.1 Encryption

| Data          | Algorithm       | Key Source                     |
| ------------- | --------------- | ------------------------------ |
| Provider Keys | AES-256-GCM     | `NOKTA_ENCRYPTION_KEY` env var |
| JWT Tokens    | HS256           | `NOKTA_JWT_SECRET` env var     |
| Database      | SQLite WAL-mode | File permissions               |

### 13.2 Input Validation

All API inputs are validated using schema-based validation:

```javascript
// Example: validate chat request
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(100000),
      }),
    )
    .max(100),
  stream: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
```

### 13.3 SecOps Rules

| Rule                       | Detection                              | Action               |
| -------------------------- | -------------------------------------- | -------------------- |
| Hardcoded Secrets          | Regex patterns for API keys, passwords | Block, log violation |
| SQL Injection              | String concatenation in queries        | Block, suggest fix   |
| XSS                        | Unsanitized HTML output                | Block, suggest fix   |
| Dependency Vulnerabilities | Known CVE scanning                     | Warn, suggest update |
