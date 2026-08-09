# Nokta Architecture: The Universal Engineering Brain

## 1. High-Level Vision

Nokta is a **Local-First Developer Operating System** that acts as an intelligent symmetry layer between a developer's IDEs (Cursor, Claude, Windsurf, VS Code) and LLM Providers (OpenAI, Anthropic, Google, local models).

Its purpose is to eliminate "AI drift" by enforcing a consistent, high-standard engineering DNA across multiple concurrent projects, regardless of the tech stack (Web, Mobile, Desktop, Cloud, Security, DevOps, Data Engineering).

### 1.1 Core Design Principles

| Principle                | Description                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-First**          | All data stays on the developer's machine. No telemetry. No cloud dependency for core functionality.                                                                                     |
| **Symmetry**             | Every prompt sent to an LLM is enriched with the developer's operational DNA, domain guardrails, and project context — ensuring consistent quality regardless of which AI model is used. |
| **Autonomous Execution** | The "Sleep Loop" can plan, implement, test, review, and create PRs without human intervention.                                                                                           |
| **Multi-Project**        | A single daemon orchestrates 10+ concurrent projects without port conflicts or context leakage.                                                                                          |
| **Self-Evolving**        | The system learns from every correction, extracts patterns, and evolves its own skill library.                                                                                           |

---

## 2. The Component Stack

### A. The Symmetry Proxy (The Gateway)

The Symmetry Proxy is the central nervous system. It intercepts all LLM traffic to ensure every prompt is optimized, contextualized, and cost-controlled.

```
IDE Request → Nokta Proxy → Context Assembler → Token Optimizer → Provider API → Response Filter → IDE
```

**Sub-components:**

| Component                     | Purpose                                                                                                                      | Implementation                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Global Context Injection**  | Injects the User Brain (Personal DNA) and Domain Best Practices into every prompt.                                           | `lib/user-brain.mjs` → `lib/chat-handler.mjs` |
| **Token Optimizer**           | Dynamically prunes context to maximize the "signal-to-noise" ratio. Only injects patterns relevant to the current file/task. | `lib/chat-handler.mjs` (relevance scoring)    |
| **Budget Guard**              | Halts execution if the estimated cost exceeds the user's daily/project limit.                                                | `lib/rate-limit.mjs` + `lib/cost-tracker.mjs` |
| **Loop Detector**             | Identifies "Fix-Break-Fix" cycles (same error → same fix → same error) and forces a "Reflection" step.                       | `agent/job-queue.mjs` (sentinel logic)        |
| **SecOps Scanner**            | Scans generated code for secrets, vulnerabilities, and anti-patterns before disk-write.                                      | `lib/gate-keeper.mjs`                         |
| **Dynamic Port Orchestrator** | Automatically assigns and manages ports for 10+ concurrent project daemons to prevent conflicts.                             | `lib/project-manager.mjs`                     |

### B. The Omni-Brain (Adaptive Intelligence)

The Omni-Brain is the system's memory and intelligence layer. It learns, remembers, and applies knowledge across all projects.

**Sub-components:**

| Component                   | Purpose                                                                                                                               | Storage                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **User DNA**                | A persistent, cross-project knowledge base of _how the developer operates_. It learns from every correction, preference, and pattern. | `user_brain` table (SQLite)           |
| **Learned Patterns**        | JSON array of `{ rule, example, domain, confidence, timestamp }`. Patterns are extracted when the developer edits AI-generated code.  | `user_brain.learned_patterns`         |
| **Design Preferences**      | JSON map of colors, fonts, style keywords, and component library preferences.                                                         | `user_brain.design_preferences`       |
| **Domain Capability Packs** | A library of best-practice rules for different engineering roles:                                                                     | `skills/` directory (Markdown + JSON) |

**Domain Capability Packs:**

| Pack               | Standards                              | Key Rules                                                                          |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `Cloud/DevOps`     | IaC, K8s, Zero-Trust                   | Terraform naming conventions, pod resource limits, network policy defaults         |
| `Security`         | OWASP, memory safety, encryption       | Never hardcode secrets, parameterized queries, input validation at boundaries      |
| `Mobile`           | Platform-native UX, battery/memory     | No blocking main thread, proper lifecycle management, offline-first patterns       |
| `Web/Desktop`      | Core Web Vitals, WCAG 2.1 AA           | Semantic HTML, keyboard navigation, 4.5:1 contrast ratio, `prefers-reduced-motion` |
| `Data Engineering` | Pipeline reliability, schema evolution | Idempotent operations, schema versioning, data lineage tracking                    |

**UI/UX Pro Max Integration:**

The `ui-ux-pro-max-skill` repository (`upstream/ui-ux-pro-max-skill/`) provides a searchable design reasoning engine:

- **BM25 Search Engine**: Local-first text ranking for design patterns, color palettes, typography pairings, chart types, and UX guidelines.
- **Multi-Domain Orchestration**: Routes queries to specialized CSV databases (`colors.csv`, `styles.csv`, `typography.csv`, `ux-guidelines.csv`, etc.).
- **Reasoning Layer**: Applies `ui-reasoning.csv` rules to determine "Style Priority" and "Recommended Patterns" before data search.
- **Master + Overrides Pattern**: Generates `MASTER.md` for global project rules and `pages/[page].md` for page-specific overrides.
- **Anti-Pattern Guardrails**: Enforces forbidden patterns (no emojis as icons, mandatory `cursor-pointer`, hover state transitions).
- **Stack-Specific Intelligence**: Separate CSV databases for React, Next.js, Vue, Svelte, Flutter, SwiftUI, Jetpack Compose, and 10+ other frameworks.

### C. The Autonomous Execution Loop (The Sleep Loop)

The Sleep Loop is the system's autonomous engine. It can plan, implement, test, review, and create PRs without human intervention.

**Pipeline:**

```
Watcher → Planner → Executor → Verification Gates → (If Fail → Reflection → Re-Execute) → PR Creator
```

**Sub-components:**

| Component             | File                     | Purpose                                                                                                                                                                                        |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AutoWatcher**       | `lib/auto-watcher.mjs`   | Watches file changes across all project directories. Debounces changes (2s default). Triggers sprint item updates and agent runs.                                                              |
| **SprintEngine**      | `lib/sprint-engine.mjs`  | Manages stories, tasks, bugs, subtasks, epics, initiatives, and sprints. Generates sprint items from codebase analysis. Integrates UI/UX Pro Max design system generation.                     |
| **AgentOrchestrator** | `agent/orchestrator.mjs` | Creates and manages agent runs. Generates step sequences from goals using LLM planning. Supports manual and automatic triggers.                                                                |
| **AgentJobQueue**     | `agent/job-queue.mjs`    | Concurrency-limited worker system (default: 2 concurrent). Manages job lifecycle: pending → running → completed/failed.                                                                        |
| **AgentJobWorker**    | `agent/job-worker.mjs`   | Executes individual steps: `prompt` (LLM call), `shell` (command execution), `edit` (file modification), `review` (diff analysis), `pr` (GitHub PR creation), `condition` (conditional logic). |
| **ChatHandler**       | `lib/chat-handler.mjs`   | Unified LLM interface. Routes to configured providers. Handles streaming and non-streaming responses.                                                                                          |

**Step Types:**

| Type        | Description                                             | Example                                          |
| ----------- | ------------------------------------------------------- | ------------------------------------------------ |
| `prompt`    | Call an LLM with messages and system prompt             | "Analyze this code for security vulnerabilities" |
| `shell`     | Execute a shell command                                 | `npm test`, `git status`, `cargo build`          |
| `edit`      | Modify a file (full write or string replacement)        | Update configuration, fix bug, add feature       |
| `review`    | Review current changes via git diff                     | "Review the diff for code quality issues"        |
| `pr`        | Create a GitHub PR (API or `gh` CLI fallback)           | "Create PR with summary of changes"              |
| `condition` | Check a condition (git state, file existence, env vars) | `git:hasChanges`, `file:exists:package.json`     |

### D. The Advanced Capability Layers

These layers extend Nokta from a "tool" into a "self-evolving system."

#### D.1 The Semantic Layer (RAG Engine)

**Purpose:** Enable deep-context retrieval across massive codebases using vector embeddings.

| Component                | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **Vector Store**         | Lightweight local vector DB (LanceDB or ChromaDB) for code embeddings. Zero cloud dependency. |
| **Embedding Pipeline**   | `AutoWatcher` detects changes → chunks code → generates embeddings → upserts to vector DB.    |
| **RAG Retrieval**        | `Query → Embedding → Vector Search → Context Ranking → Prompt Injection`.                     |
| **Incremental Indexing** | Real-time updating of embeddings. Only re-indexes changed files, not entire codebase.         |
| **Cross-Project Search** | Query across all indexed projects for shared patterns and dependencies.                       |

**Integration Point:** The Semantic Layer feeds into the Context Assembler (Section 2A), providing vector-ranked context alongside the User DNA and Domain Guardrails.

#### D.2 The Adversarial Layer (Critic/Implementer)

**Purpose:** Prevent regressions and ensure standard compliance through dual-agent review.

| Component                    | Description                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Implementer**          | Focuses on speed and feature delivery. Generates code, tests, and documentation.                                                                |
| **The Critic**               | Focuses on edge cases, performance, security, and "Symmetry DNA" compliance. Reviews every Implementer output.                                  |
| **Conflict Resolution Loop** | If the Critic rejects a PR, the Implementer must address feedback before the Verification Gate opens. Maximum 3 rounds before human escalation. |
| **Critic Heuristics**        | Security vulnerability scan, performance regression detection, style guide compliance, test coverage verification.                              |

**Integration Point:** The Adversarial Layer wraps the `AgentOrchestrator.executeRun()` method, adding a review step after every `edit` or `shell` step.

#### D.3 The Sandbox Layer (Isolated Execution)

**Purpose:** Execute agent-written scripts in secure, isolated environments.

| Component                 | Description                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| **Containerized Runtime** | Docker containers or WASM runtimes for script execution.                                    |
| **Resource Capping**      | Strict CPU/RAM limits (e.g., 2 cores, 512MB RAM) and network access controls.               |
| **Ephemeral States**      | Every execution starts from a clean snapshot. Only approved artifacts persist to main disk. |
| **Dependency Isolation**  | Each project's dependencies are isolated. No cross-project contamination.                   |
| **Audit Trail**           | Full execution logs stored for review and debugging.                                        |

**Integration Point:** The Sandbox Layer wraps the `AgentJobWorker` shell execution, routing commands through containerized environments.

#### D.4 The Evolution Layer (Skill Synthesis)

**Purpose:** Automatically convert successful agent-written scripts into reusable Nokta Skills.

| Component                  | Description                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Pattern Detection**      | Monitors successful autonomous sequences. Tracks which fix patterns work.                                                   |
| **Skill Synthesis**        | When a "Fix Pattern" is used successfully 3+ times, converts the sequence into a formal `Nokta Skill` (JSON/MD definition). |
| **Skill Registry**         | New skills are added to the `skills/` directory with metadata, examples, and version tracking.                              |
| **Self-Improving Library** | Continuous expansion of Domain Capability Packs through agent-led discovery.                                                |

**Integration Point:** The Evolution Layer runs as a background process, analyzing completed agent runs and synthesizing new skills.

### E. The Data Layer (DBOps)

All persistent storage uses SQLite with WAL-mode for high-concurrency local access.

**Schema Version:** 2

**Tables:**

| Table             | Purpose                             | Key Columns                                                                            |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| `users`           | User accounts and tier management   | `id`, `email`, `role`, `tier`, `monthly_cost_limit`, `daily_token_limit`               |
| `sessions`        | JWT session management              | `id`, `user_id`, `token`, `expires_at`                                                 |
| `provider_keys`   | Encrypted LLM provider API keys     | `id`, `user_id`, `provider`, `key_encrypted`, `key_nonce`, `key_tag`                   |
| `cost_logs`       | Token usage and cost tracking       | `id`, `user_id`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost`                |
| `agent_runs`      | Autonomous agent execution tracking | `id`, `user_id`, `project_id`, `goal`, `status`, `trigger`, `current_step`             |
| `agent_run_steps` | Individual step results within runs | `id`, `run_id`, `step_index`, `type`, `status`, `output`, `error`, `duration_ms`       |
| `sprint_items`    | Project management items            | `id`, `user_id`, `project_id`, `type`, `title`, `priority`, `status`, `auto_generated` |
| `projects`        | Multi-project registry              | `id`, `user_id`, `name`, `root_path`, `tech_stack`                                     |
| `user_brain`      | Developer operational DNA           | `user_id`, `operational_dna`, `design_preferences`, `learned_patterns`                 |
| `user_configs`    | Per-user configuration              | `user_id`, `config`                                                                    |

**Security:**

- API keys are encrypted with AES-256-GCM (double-encryption: provider key → master key).
- Master encryption key stored in `NOKTA_ENCRYPTION_KEY` environment variable.
- All database operations use parameterized queries (SQL injection prevention).

---

## 3. Network & Port Strategy (Multi-Project Mode)

To support 10+ projects without conflict:

### 3.1 The Master Daemon

A single Node.js process running on a fixed port (default: 4217). All project management flows through this daemon.

### 3.2 Virtual Project Contexts

The daemon maintains a `Map<ProjectId, ProjectInstance>` in memory. Each project instance has its own:

- SprintEngine
- AgentOrchestrator
- AutoWatcher
- JobQueue

### 3.3 Header-Based Routing

The IDE (or the Nokta UI) sends a `X-Nokta-Project-Id` header with every request. The daemon routes the request to the corresponding project's services.

### 3.4 Port-on-Demand

If a project requires a real running server (e.g., a Vite dev server), Nokta assigns a port from a pool (4000-5000) and tracks it in the `projects` table.

---

## 4. The ECC Integration (Everything Claude Code)

The `ECC` repository (`upstream/ECC/`) provides a production-ready plugin system with 67 specialized agents, 271 skills, 92 commands, and automated hook workflows.

### 4.1 Key Intelligence Extracted from ECC

| Pattern                    | ECC Implementation                                                                                                    | Nokta Integration                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Agent-First Delegation** | 67 specialized agents (planner, architect, tdd-guide, code-reviewer, security-reviewer, etc.)                         | Map ECC agent types to Nokta step types. Each ECC agent becomes a Nokta "Capability Pack."         |
| **TDD Workflow**           | Write test first (RED) → minimal implementation (GREEN) → refactor (IMPROVE)                                          | Nokta's `prompt` step can invoke TDD workflow. `shell` step runs tests. `edit` step applies fixes. |
| **Security-First**         | No hardcoded secrets, input validation at boundaries, parameterized queries, XSS/CSRF prevention                      | Nokta's `GateKeeper` enforces these rules during code generation and PR review.                    |
| **Immutability Pattern**   | Always create new objects, never mutate. Return new copies with changes applied.                                      | Inject as a "Learned Pattern" into User Brain when detected in developer's code.                   |
| **File Organization**      | Many small files (200-400 lines, 800 max). Feature/domain organization, not type organization.                        | Enforce via SprintEngine linting rules and Critic heuristics.                                      |
| **Error Handling**         | Handle errors at every level. User-friendly UI messages, detailed server-side logging. Never silently swallow errors. | Inject as Domain Capability Pack rule for all projects.                                            |
| **Loop Monitoring**        | `loop-operator` agent monitors autonomous loops, detects stalls, intervenes when needed.                              | Map to Nokta's `Loop Detector` in the Sentinel.                                                    |
| **Spec Mining**            | `spec-miner` extracts brownfield project specifications for spec-driven development.                                  | Add as a new step type: `spec-mine` → analyze codebase → generate project spec.                    |
| **Code Review**            | `code-reviewer` agent with quality checklist, 80%+ coverage requirement.                                              | Map to Nokta's `review` step type with Critic integration.                                         |

### 4.2 ECC Agent → Nokta Capability Pack Mapping

| ECC Agent              | Nokta Capability Pack   | Trigger                        |
| ---------------------- | ----------------------- | ------------------------------ |
| `planner`              | `planning`              | Complex feature requests       |
| `architect`            | `architecture`          | Architectural decisions        |
| `tdd-guide`            | `tdd`                   | New features, bug fixes        |
| `code-reviewer`        | `code-quality`          | After code modifications       |
| `security-reviewer`    | `security`              | Before commits, sensitive code |
| `build-error-resolver` | `build-fix`             | When build fails               |
| `e2e-runner`           | `e2e-testing`           | Critical user flows            |
| `refactor-cleaner`     | `refactoring`           | Code maintenance               |
| `loop-operator`        | `autonomous-monitoring` | During autonomous loops        |
| `spec-miner`           | `spec-extraction`       | Brownfield project onboarding  |

---

## 5. The UI/UX Pro Max Integration (Deep Dive)

The `ui-ux-pro-max-skill` repository provides the design intelligence backbone.

### 5.1 BM25 Search Engine

A local-first, dependency-free text ranking algorithm:

```python
# core.py - BM25 Implementation
class BM25:
    def __init__(self, k1=1.5, b=0.75):
        self.k1 = k1  # Term frequency saturation
        self.b = b     # Document length normalization

    def fit(self, documents):
        # Build inverted index, calculate IDF scores

    def score(self, query):
        # Rank all documents against query tokens
```

**Key Features:**

- Zero external dependencies (pure Python).
- Handles 10+ domain-specific CSV databases simultaneously.
- Auto-detects query domain via regex keyword matching.

### 5.2 Multi-Domain Search Orchestration

| Domain         | CSV File                | Search Columns                           | Purpose                        |
| -------------- | ----------------------- | ---------------------------------------- | ------------------------------ |
| `style`        | `styles.csv`            | Style Category, Keywords, Best For, Type | UI style recommendations       |
| `color`        | `colors.csv`            | Product Type, Notes                      | Color palette generation       |
| `chart`        | `charts.csv`            | Data Type, Keywords, Best Chart Type     | Chart type selection           |
| `landing`      | `landing.csv`           | Pattern Name, Keywords, Section Order    | Landing page structure         |
| `product`      | `products.csv`          | Product Type, Keywords                   | Product-type-specific guidance |
| `ux`           | `ux-guidelines.csv`     | Category, Issue, Description             | UX best practices              |
| `typography`   | `typography.csv`        | Font Pairing Name, Category, Mood        | Typography pairing             |
| `icons`        | `icons.csv`             | Category, Icon Name, Keywords            | Icon selection                 |
| `react`        | `react-performance.csv` | Category, Issue, Keywords                | React performance patterns     |
| `web`          | `app-interface.csv`     | Category, Issue, Keywords                | Web app interface patterns     |
| `google-fonts` | `google-fonts.csv`      | Family, Category, Stroke                 | Google Fonts metadata          |

**Stack-Specific Databases:**

| Stack             | File                         | Purpose                      |
| ----------------- | ---------------------------- | ---------------------------- |
| `react`           | `stacks/react.csv`           | React-specific guidelines    |
| `nextjs`          | `stacks/nextjs.csv`          | Next.js patterns             |
| `vue`             | `stacks/vue.vue`             | Vue.js conventions           |
| `flutter`         | `stacks/flutter.csv`         | Flutter/Dart patterns        |
| `swiftui`         | `stacks/swiftui.csv`         | iOS/SwiftUI guidelines       |
| `jetpack-compose` | `stacks/jetpack-compose.csv` | Android/Compose patterns     |
| `shadcn`          | `stacks/shadcn.csv`          | shadcn/ui component patterns |

### 5.3 Design System Generation

The `DesignSystemGenerator` class orchestrates multi-domain searches and applies reasoning rules:

```python
# design_system.py - Generation Pipeline
1. Search product domain → determine category (SaaS, e-commerce, etc.)
2. Load reasoning rules for category → get style priority, color mood, typography mood
3. Multi-domain search with style priority hints
4. Select best matches using priority keyword scoring
5. Build final recommendation with pattern, style, colors, typography, effects
6. Format as ASCII box or Markdown
```

**Output Format:**

- `MASTER.md`: Global project rules (colors, typography, spacing, shadows, components, anti-patterns, pre-delivery checklist).
- `pages/[page-name].md`: Page-specific overrides that inherit from MASTER.

### 5.4 Anti-Pattern Guardrails

Hardcoded forbidden patterns enforced during code generation and PR review:

- No emojis as icons (use SVG: Heroicons/Lucide)
- Mandatory `cursor-pointer` on all clickable elements
- Hover states with smooth transitions (150-300ms)
- Minimum 4.5:1 contrast ratio for text
- Visible focus states for keyboard navigation
- `prefers-reduced-motion` respected
- Responsive breakpoints: 375px, 768px, 1024px, 1440px

---

## 6. The SaaS Shell (Monetization Architecture)

### 6.1 Multi-Tenancy

- **Local Mode**: SQLite with WAL-mode (current implementation).
- **Production Mode**: PostgreSQL for horizontal scaling.
- **Workspace Isolation**: Each user's data, projects, and brain are fully isolated.

### 6.2 Billing & Tiering

| Tier       | Rate Limit  | Monthly Cost Limit | Daily Token Limit | Features                                 |
| ---------- | ----------- | ------------------ | ----------------- | ---------------------------------------- |
| Free       | 10 req/min  | $5.00              | 100K tokens       | Basic proxy, 1 project                   |
| Pro        | 60 req/min  | $50.00             | 1M tokens         | Full proxy, 10 projects, autonomous loop |
| Enterprise | 300 req/min | $500.00            | 10M tokens        | Custom models, priority support, SLA     |

### 6.3 Cloud Deployment

- Dockerized with `docker-compose.yml` (PostgreSQL + Redis + Nokta daemon).
- Kubernetes manifests for production scaling.
- Cloud-based context synchronization for multi-device workflows.

---

## 7. File Structure

```
nokta/
├── daemon/                          # Core daemon
│   ├── server.mjs                   # Express server with all routes
│   ├── index.mjs                    # Entry point
│   ├── db/
│   │   ├── schema.mjs               # SQLite migrations (v1, v2)
│   │   └── connection.mjs           # Database connection
│   ├── lib/
│   │   ├── auth.mjs                 # JWT authentication
│   │   ├── auto-watcher.mjs         # File system watcher
│   │   ├── chat-handler.mjs         # Unified LLM interface
│   │   ├── config.mjs               # Configuration management
│   │   ├── cost-tracker.mjs         # Token cost tracking
│   │   ├── crypto.mjs               # AES-256-GCM encryption
│   │   ├── discovery.mjs            # Background project discovery
│   │   ├── gate-keeper.mjs          # Security/compliance gates
│   │   ├── project-manager.mjs      # Multi-project lifecycle
│   │   ├── provider-manager.mjs     # LLM provider management
│   │   ├── rate-limit.mjs           # Tier-aware rate limiting
│   │   ├── sprint-engine.mjs        # Sprint/item management
│   │   ├── user-brain.mjs           # Developer DNA storage
│   │   └── watcher.mjs              # Legacy watcher
│   ├── agent/
│   │   ├── orchestrator.mjs         # Agent run management
│   │   ├── executor.mjs             # Step execution engine
│   │   ├── job-queue.mjs            # Concurrency-limited queue
│   │   ├── job-worker.mjs           # Individual step execution
│   │   ├── storage.mjs              # File-based run storage
│   │   └── db-storage.mjs           # Database run storage
│   ├── routes/                      # 18 API route modules
│   ├── providers/                   # LLM provider implementations
│   ├── public/                      # Dashboard UI
│   └── types.mjs                    # Type definitions
├── upstream/
│   ├── ui-ux-pro-max-skill/         # Design intelligence engine
│   │   ├── src/ui-ux-pro-max/
│   │   │   ├── data/                # 15+ CSV databases
│   │   │   ├── scripts/             # BM25 search, design system generator
│   │   │   └── templates/           # Platform-specific configs
│   │   └── cli/                     # CLI installer
│   └── ECC/                         # Everything Claude Code
│       ├── agents/                  # 67 specialized agents
│       ├── skills/                  # 271 workflow skills
│       ├── commands/                # 92 slash commands
│       ├── hooks/                   # Trigger-based automations
│       ├── rules/                   # Always-follow guidelines
│       ├── mcp-configs/             # MCP server configurations
│       └── scripts/                 # Cross-platform utilities
├── docs/
│   ├── architecture.md              # This document
│   ├── tech-spec.md                 # Technical specifications
│   └── roadmap.md                   # Execution roadmap
├── tests/                           # 64 integration/unit tests
├── .cursorrules                     # Master agent instructions
├── Dockerfile                       # Production container
├── docker-compose.yml               # Multi-service deployment
└── run_app.sh                       # Startup script
```

---

## 8. API Surface

### 8.1 Core Endpoints

| Method | Path                             | Purpose                   |
| ------ | -------------------------------- | ------------------------- |
| `POST` | `/api/v1/auth/register`          | User registration         |
| `POST` | `/api/v1/auth/login`             | User login (JWT)          |
| `POST` | `/api/v1/chat`                   | LLM chat (proxy endpoint) |
| `POST` | `/api/v1/complete`               | LLM completion            |
| `GET`  | `/api/v1/providers`              | List configured providers |
| `POST` | `/api/v1/providers`              | Add/update provider key   |
| `GET`  | `/api/v1/costs`                  | Get cost logs             |
| `GET`  | `/api/v1/gates`                  | Get gate configurations   |
| `POST` | `/api/v1/agent-runs`             | Create agent run          |
| `POST` | `/api/v1/agent-runs/:id/execute` | Execute agent run         |
| `POST` | `/api/v1/agent-runs/:id/cancel`  | Cancel agent run          |
| `GET`  | `/api/v1/sprint-items`           | List sprint items         |
| `POST` | `/api/v1/sprint-items`           | Create sprint item        |
| `GET`  | `/api/v1/projects`               | List projects             |
| `POST` | `/api/v1/projects`               | Register project          |
| `POST` | `/api/v1/uiux/design-system`     | Generate design system    |
| `GET`  | `/api/v1/health`                 | Health check              |
| `GET`  | `/api/v1/docs`                   | Swagger UI                |

### 8.2 SSE Events (Real-Time)

| Event               | Purpose                  |
| ------------------- | ------------------------ |
| `run:created`       | Agent run created        |
| `run:started`       | Agent run started        |
| `run:step-start`    | Step execution started   |
| `run:step-complete` | Step execution completed |
| `run:completed`     | Agent run completed      |
| `run:updated`       | Agent run status changed |

---

## 9. Security Architecture

### 9.1 Authentication & Authorization

- **JWT Tokens**: Short-lived (1h) access tokens with refresh support.
- **Role-Based Access**: `user`, `admin`, `superadmin` roles.
- **Tier-Based Rate Limiting**: Free/Pro/Enterprise tiers with different request limits.

### 9.2 Data Protection

- **Encryption at Rest**: AES-256-GCM for all provider keys.
- **Encryption in Transit**: HTTPS enforced in production.
- **No Telemetry**: All data stays on the developer's machine.
- **Input Validation**: Schema-based validation at all API boundaries.

### 9.3 Agent Security

- **Sandbox Execution**: Agent scripts run in isolated environments.
- **Resource Capping**: CPU/RAM limits prevent agent runaway.
- **Audit Trail**: Full execution logs for every agent run.
- **SecOps Scanner**: Blocks commits containing secrets or vulnerabilities.

---

## 10. Performance Characteristics

| Metric                     | Target           | Implementation                            |
| -------------------------- | ---------------- | ----------------------------------------- |
| **Daemon Startup**         | < 2 seconds      | Lazy initialization of providers          |
| **Proxy Latency**          | < 50ms overhead  | Stream-through, minimal processing        |
| **Sprint Item Generation** | < 10 seconds     | Background analysis with debounce         |
| **Agent Run Creation**     | < 3 seconds      | LLM-based step planning                   |
| **Token Optimization**     | 30-60% reduction | Relevance scoring + noise stripping       |
| **Concurrent Projects**    | 10+              | Virtual project contexts + header routing |
| **Database Queries**       | < 10ms           | WAL-mode + proper indexing                |

---

## 11. Edge Cases & Security Hardening

For comprehensive coverage of all unhandled scenarios, see **[`docs/edge-cases.md`](./edge-cases.md)**.

This covers:

- **SecOps**: Injection vectors, authentication gaps, cryptography weaknesses, supply chain attacks
- **DBOps**: Connection failures, migration issues, data integrity, concurrency, recovery playbooks
- **FinOps**: Cost tracking gaps, budget enforcement, provider economics
- **Autonomous Loop**: Infinite loops, error recovery, concurrency, execution scenarios
- **Multi-Project**: Isolation, resource management, project lifecycle
- **Semantic Layer**: Index integrity, privacy, quality
- **Evolution Layer**: Skill quality, conflict detection, versioning
- **Sandbox Layer**: Container security, resource exhaustion
- **Cross-Cutting**: Graceful shutdown, logging, observability, configuration
- **Operational Scenarios**: Developer workflow, code quality, infrastructure, business
- **Recovery Playbooks**: Database corruption, key compromise, infinite loops, container escape
- **Monitoring & Alerting**: Critical alerts, metrics to track

---

## 12. Future Evolution

### 11.1 Short-Term (Phase 1-2)

- Complete multi-project registry with `ProjectManager`.
- Implement User Brain learning pipeline.
- Build the Symmetry Proxy for LLM interception.

### 11.2 Medium-Term (Phase 3)

- Deploy the Adversarial Layer (Critic/Implementer).
- Implement the Sandbox Layer (containerized execution).
- Build the autonomous Sleep Loop 2.0.

### 11.3 Long-Term (Phase 4-5)

- Integrate the Semantic Layer (Vector DB + RAG).
- Deploy the Evolution Layer (Skill Synthesis).
- Launch the SaaS Shell with multi-tenancy and billing.

### 11.4 The Endgame

Nokta becomes a **self-evolving engineering brain** that:

1. Learns from every developer interaction.
2. Evolves its own skill library through agent-led discovery.
3. Provides consistent, high-quality AI assistance across all projects.
4. Operates autonomously through the Sleep Loop.
5. Monetizes through tiered SaaS subscriptions.
