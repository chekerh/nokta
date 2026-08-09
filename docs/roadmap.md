# Nokta Roadmap: The Path to the Universal Engineering Brain

## Executive Summary

Nokta is evolving from a developer tool into a **self-evolving engineering brain**. This roadmap outlines the path from a stable, professional foundation to a fully autonomous, self-improving system that operates across 10+ concurrent projects.

---

## Phase 0: Critical Security & Stability Fixes

**Goal:** Patch all P0 vulnerabilities before any new features.

**Duration:** 1-2 weeks  
**Status:** Critical — Must complete before Phase 1

| Task                                                    | Status     | Priority | Risk                 |
| ------------------------------------------------------- | ---------- | -------- | -------------------- |
| Fix shell command injection in executor.mjs             | 🔲 Pending | P0       | RCE                  |
| Fix path traversal in executor.mjs edit step            | 🔲 Pending | P0       | Arbitrary file write |
| Fix `process.env` leaked to worker processes            | 🔲 Pending | P0       | Credential theft     |
| Fix PR step command injection                           | 🔲 Pending | P0       | RCE via GitHub       |
| Implement session revocation / token blacklist          | 🔲 Pending | P0       | Account takeover     |
| Implement atomic file writes for sprint/agent/cost data | 🔲 Pending | P0       | Data corruption      |
| Fix `removeProject` dead code                           | 🔲 Pending | P0       | Resource leak        |
| Implement cost cap enforcement                          | 🔲 Pending | P0       | Runaway billing      |
| Add login rate limiting                                 | 🔲 Pending | P0       | Brute-force          |
| Use `crypto.timingSafeEqual()` for JWT comparison       | 🔲 Pending | P0       | Token forgery        |
| Implement infinite loop protection                      | 🔲 Pending | P0       | System exhaustion    |
| Add max concurrent runs per user                        | 🔲 Pending | P0       | Resource exhaustion  |

For full list see [`docs/edge-cases.md`](./edge-cases.md)  
For concrete implementation designs see [`docs/system-design.md`](./system-design.md)

---

## Phase 0.5: Security Hardening (P1 Fixes)

**Goal:** Patch all high-priority vulnerabilities before beta.

**Duration:** 2-3 weeks  
**Status:** Pending

| Task                                                           | Status     | Priority | Risk                    |
| -------------------------------------------------------------- | ---------- | -------- | ----------------------- |
| Enforce RBAC — add role checks to admin routes                 | 🔲 Pending | P1       | Privilege escalation    |
| Implement DOWN migrations + transaction wrapping               | 🔲 Pending | P1       | Schema corruption       |
| Add session cleanup cron (purge expired sessions)              | 🔲 Pending | P1       | Disk exhaustion         |
| Restrict CORS to known origins                                 | 🔲 Pending | P1       | CSRF / data theft       |
| Enforce HTTPS (TLS termination or reverse proxy)               | 🔲 Pending | P1       | MITM attacks            |
| Implement database backup mechanism                            | 🔲 Pending | P1       | Irrecoverable data loss |
| Add graceful shutdown (SIGTERM handler + drain)                | 🔲 Pending | P1       | Data loss on restart    |
| Implement infinite loop protection (max iterations + cooldown) | 🔲 Pending | P1       | System exhaustion       |
| Add max concurrent runs per user (limit: 5)                    | 🔲 Pending | P1       | Resource exhaustion     |
| Rotate JWT secret automatically (every 90 days)                | 🔲 Pending | P1       | Token compromise        |

---

## Phase 0.7: Security Hardening (P2 Fixes)

**Goal:** Complete medium-priority security and stability fixes.

**Duration:** 2-3 weeks  
**Status:** Pending

| Task                                                       | Status     | Priority | Risk                       |
| ---------------------------------------------------------- | ---------- | -------- | -------------------------- |
| Implement configurable model pricing (not hardcoded)       | 🔲 Pending | P2       | Incorrect cost tracking    |
| Add structured logging (JSON lines format)                 | 🔲 Pending | P2       | Poor observability         |
| Implement request tracing (request ID propagation)         | 🔲 Pending | P2       | Debugging difficulty       |
| Add cost prediction (linear regression on historical data) | 🔲 Pending | P2       | Users surprised by bills   |
| Enhance health check (DB, disk, memory checks)             | 🔲 Pending | P2       | Shallow monitoring         |
| Replace in-memory locks with file-based locks              | 🔲 Pending | P2       | Data races in cluster      |
| Add .env file support (dotenv integration)                 | 🔲 Pending | P2       | Manual configuration       |
| Add config validation (JSON Schema)                        | 🔲 Pending | P2       | Silent misconfiguration    |
| Add supply chain auditing (npm audit + snyk)               | 🔲 Pending | P2       | Dependency vulnerabilities |
| Add performance profiling (latency tracking)               | 🔲 Pending | P2       | Unknown bottlenecks        |

---

## Phase 1: The Professional's Foundation (Current Focus)

**Goal:** Build the most stable, high-standard tool for the lead engineer.

**Duration:** 2-3 weeks  
**Status:** In Progress

### 1.1 Multi-Project Registry & DBOps

| Task                                                                       | Status     | Priority | Dependencies   |
| -------------------------------------------------------------------------- | ---------- | -------- | -------------- |
| Implement `projects` table for managing 10+ concurrent projects            | ✅ Done    | High     | None           |
| Build `ProjectManager` to handle lazy-loading of project-specific services | ✅ Done    | High     | projects table |
| Implement **Dynamic Port Mapping** to eliminate port conflicts             | ✅ Done    | High     | ProjectManager |
| Implement **Header-Based Routing** for project context switching           | 🔲 Pending | High     | ProjectManager |
| Add **Tech Stack Detection** for automatic project categorization          | 🔲 Pending | Medium   | None           |

### 1.2 The Global User Brain (Symmetry)

| Task                                                             | Status     | Priority | Dependencies |
| ---------------------------------------------------------------- | ---------- | -------- | ------------ |
| Implement `user_brain` table (Operational DNA, Learned Patterns) | ✅ Done    | High     | None         |
| Build "Correction-to-Learning" pipeline                          | 🔲 Pending | High     | user_brain   |
| Inject Global DNA into every prompt via the Proxy Gateway        | 🔲 Pending | High     | chat-handler |
| Implement **Pattern Confidence Scoring**                         | 🔲 Pending | Medium   | user_brain   |
| Build **Design Preferences** extraction from codebase            | 🔲 Pending | Medium   | user_brain   |

### 1.3 Domain-Specific Capability Packs

| Task                                                               | Status     | Priority | Dependencies  |
| ------------------------------------------------------------------ | ---------- | -------- | ------------- |
| Create "Standard Guardrails" for Cloud/DevOps                      | 🔲 Pending | High     | None          |
| Create "Standard Guardrails" for Mobile                            | 🔲 Pending | High     | None          |
| Create "Standard Guardrails" for Security                          | 🔲 Pending | High     | None          |
| Create "Standard Guardrails" for Web                               | 🔲 Pending | High     | None          |
| Integrate `ui-ux-pro-max` design system generator into Sprint flow | ✅ Done    | High     | sprint-engine |

### 1.4 UI/UX Pro Max Integration

| Task                                                                   | Status     | Priority | Dependencies        |
| ---------------------------------------------------------------------- | ---------- | -------- | ------------------- |
| Clone and integrate `ui-ux-pro-max-skill` repository                   | ✅ Done    | High     | None                |
| Implement BM25 search engine for design patterns                       | ✅ Done    | High     | ui-ux-pro-max       |
| Build multi-domain search orchestration (style, color, typography, UX) | ✅ Done    | High     | BM25                |
| Implement Design System Generator (MASTER.md + page overrides)         | ✅ Done    | High     | multi-domain search |
| Integrate anti-pattern guardrails into code generation                 | 🔲 Pending | Medium   | design system       |

---

## Phase 2: The Intelligence Proxy (Symmetry Layer)

**Goal:** Control the flow of information between the IDE and the LLM.

**Duration:** 3-4 weeks  
**Status:** Planning

### 2.1 The Context Proxy Gateway

| Task                                                                               | Status     | Priority | Dependencies |
| ---------------------------------------------------------------------------------- | ---------- | -------- | ------------ |
| Build a lightweight proxy to intercept IDE → LLM calls                             | 🔲 Pending | Critical | None         |
| Implement **Symmetry Injection**: Project Context + User Brain + Domain Guardrails | 🔲 Pending | Critical | proxy        |
| Implement **Token Pruning**: Dynamic compression of context                        | 🔲 Pending | High     | proxy        |
| Add **Provider Routing**: Select best provider based on cost/quality               | 🔲 Pending | High     | proxy        |
| Implement **Streaming Passthrough** for real-time responses                        | 🔲 Pending | High     | proxy        |

### 2.2 Sentry Sentinel (The Guard)

| Task                                                     | Status     | Priority | Dependencies |
| -------------------------------------------------------- | ---------- | -------- | ------------ |
| **Budget Guard**: Hard-cap token costs per project       | 🔲 Pending | Critical | cost-tracker |
| **Loop Detector**: Identify "Fix-Break-Fix" cycles       | 🔲 Pending | High     | sentinel     |
| **SecOps Scanner**: Block commits containing secrets     | 🔲 Pending | High     | gate-keeper  |
| **Quality Gate**: Check response against quality metrics | 🔲 Pending | Medium   | sentinel     |
| **Audit Trail**: Log all agent actions for review        | 🔲 Pending | Medium   | sentinel     |

---

## Phase 3: The Autonomous "Sleep Loop" 2.0

**Goal:** True autopilot that delivers production-ready PRs.

**Duration:** 4-6 weeks  
**Status:** Planning

### 3.1 Advanced Execution

| Task                                                                                       | Status     | Priority | Dependencies    |
| ------------------------------------------------------------------------------------------ | ---------- | -------- | --------------- |
| **Self-Healing Pipeline**: Watcher → Planner → Executor → Verify → Fix → PR                | 🔲 Pending | Critical | orchestrator    |
| **Multi-Language verification**: Map linter/test commands for any detected stack           | 🔲 Pending | High     | executor        |
| **Cross-Project Sync**: Auto-detect dependency changes across the portfolio                | 🔲 Pending | Medium   | project-manager |
| **The Adversarial Layer**: Implement the "Critic" agent to review "Implementer" agent work | 🔲 Pending | Critical | orchestrator    |
| **The Sandbox Layer**: Implement containerized execution for secure, isolated agent runs   | 🔲 Pending | High     | executor        |
| **Step Dependency Graph**: Allow parallel execution of independent steps                   | 🔲 Pending | Medium   | job-queue       |

### 3.2 PR Mastery

| Task                                                              | Status     | Priority | Dependencies |
| ----------------------------------------------------------------- | ---------- | -------- | ------------ |
| Automated Git flow: Checkout branch → Stage → Commit → Push → PR  | ✅ Done    | High     | executor     |
| AI-generated PR summaries mapping changes back to Sprint items    | 🔲 Pending | High     | orchestrator |
| **Branch Strategy**: Automatic branch creation and cleanup        | 🔲 Pending | Medium   | executor     |
| **PR Review Integration**: Auto-request reviews from team members | 🔲 Pending | Low      | executor     |

### 3.3 ECC Integration

| Task                                                         | Status     | Priority | Dependencies |
| ------------------------------------------------------------ | ---------- | -------- | ------------ |
| Clone and audit `ECC` repository                             | ✅ Done    | High     | None         |
| Map ECC agents to Nokta step types                           | 🔲 Pending | High     | orchestrator |
| Implement TDD workflow as Nokta capability                   | 🔲 Pending | High     | executor     |
| Extract security rules from ECC into Domain Capability Packs | 🔲 Pending | Medium   | skills       |
| Implement spec-miner pattern for brownfield projects         | 🔲 Pending | Medium   | orchestrator |

---

## Phase 4: The Evolution & Semantic Brain

**Goal:** Move from a tool that uses AI to a system that evolves its own intelligence.

**Duration:** 6-8 weeks  
**Status:** Planning

### 4.1 The Semantic Layer

| Task                                                                   | Status     | Priority | Dependencies |
| ---------------------------------------------------------------------- | ---------- | -------- | ------------ |
| Integrate Vector DB for project-wide RAG                               | 🔲 Pending | Critical | None         |
| Implement Incremental Indexing for real-time codebase awareness        | 🔲 Pending | High     | vector-db    |
| Build "Deep-Context" retrieval that spans multiple projects            | 🔲 Pending | High     | vector-db    |
| **Embedding Pipeline**: AST-aware code chunking + embedding generation | 🔲 Pending | High     | vector-db    |
| **Context Ranking**: Relevance + recency + importance scoring          | 🔲 Pending | Medium   | vector-db    |

### 4.2 The Evolution Layer

| Task                                                                  | Status     | Priority | Dependencies      |
| --------------------------------------------------------------------- | ---------- | -------- | ----------------- |
| Implement pattern detection for successful agent sequences            | 🔲 Pending | Critical | orchestrator      |
| Build skill synthesis pipeline (successful patterns → Nokta Skills)   | 🔲 Pending | High     | pattern-detection |
| Create "Self-Improving Library" of domain capability packs            | 🔲 Pending | High     | skill-synthesis   |
| **Confidence Scoring**: Track success rate of synthesized skills      | 🔲 Pending | Medium   | skill-synthesis   |
| **Skill Versioning**: Automatic version bumps when skills are updated | 🔲 Pending | Low      | skill-synthesis   |

---

## Phase 5: The SaaS Shell (Monetization)

**Goal:** Wrap the professional tool into a hostable service.

**Duration:** 4-6 weeks  
**Status:** Planning

### 5.1 Multi-Tenancy

| Task                                                               | Status     | Priority | Dependencies |
| ------------------------------------------------------------------ | ---------- | -------- | ------------ |
| Move from local `node:sqlite` to PostgreSQL for production scaling | 🔲 Pending | Critical | None         |
| Implement multi-user workspace isolation                           | 🔲 Pending | Critical | PostgreSQL   |
| **Data Encryption**: AES-256-GCM for all sensitive data at rest    | 🔲 Pending | Critical | PostgreSQL   |
| **Audit Logging**: Track all user actions for compliance           | 🔲 Pending | Medium   | PostgreSQL   |

### 5.2 Billing & Tiering

| Task                                                              | Status     | Priority | Dependencies |
| ----------------------------------------------------------------- | ---------- | -------- | ------------ |
| Stripe Subscription integration (Free, Pro, Enterprise)           | 🔲 Pending | Critical | None         |
| Tier-aware rate limiting (API quotas)                             | ✅ Done    | High     | None         |
| **Usage Dashboard**: Real-time cost and token usage visualization | 🔲 Pending | High     | cost-tracker |
| **Invoice Generation**: Automatic monthly invoice creation        | 🔲 Pending | Medium   | stripe       |

### 5.3 Cloud Deployment

| Task                                                    | Status     | Priority | Dependencies |
| ------------------------------------------------------- | ---------- | -------- | ------------ |
| Dockerized deployment with K8s orchestration            | 🔲 Pending | Critical | None         |
| Cloud-based context synchronization                     | 🔲 Pending | High     | PostgreSQL   |
| **CI/CD Pipeline**: Automated testing and deployment    | 🔲 Pending | High     | Docker       |
| **Monitoring**: Prometheus metrics + Grafana dashboards | 🔲 Pending | Medium   | K8s          |
| **SSL/TLS**: Automatic certificate management           | 🔲 Pending | High     | K8s          |

---

## Phase 5.5: The Trust Architecture

**Goal:** Transform Nokta from "AI code generator" to "AI code guardian" — the tool that makes AI trustworthy.

**Duration:** 4-6 weeks  
**Status:** Design Complete

### 5.5.1 Scope Enforcement Engine

| Task                                                   | Status     | Priority | Dependencies  |
| ------------------------------------------------------ | ---------- | -------- | ------------- |
| Build `ScopeEnforcer` class with glob pattern matching | 🔲 Pending | Critical | None          |
| Add `scope` step type to executor                      | 🔲 Pending | Critical | executor.mjs  |
| Integrate scope checks into edit/write operations      | 🔲 Pending | Critical | ScopeEnforcer |
| Build scope violation reporting and alerts             | 🔲 Pending | High     | ScopeEnforcer |
| Add scope declaration UI in dashboard                  | 🔲 Pending | Medium   | dashboard     |

### 5.5.2 Production Readiness Gate

| Task                                                        | Status     | Priority | Dependencies   |
| ----------------------------------------------------------- | ---------- | -------- | -------------- |
| Build `ProductionGate` class with 8 check categories        | 🔲 Pending | Critical | None           |
| Implement error handling, input validation, timeout checks  | 🔲 Pending | Critical | ProductionGate |
| Implement retry logic, resource cleanup, concurrency checks | 🔲 Pending | High     | ProductionGate |
| Implement logging, graceful degradation checks              | 🔲 Pending | High     | ProductionGate |
| Integrate gate into review step and PR creation             | 🔲 Pending | Critical | executor.mjs   |
| Add production readiness score to dashboard                 | 🔲 Pending | Medium   | dashboard      |

### 5.5.3 Context Persistence Layer

| Task                                                                 | Status     | Priority | Dependencies                |
| -------------------------------------------------------------------- | ---------- | -------- | --------------------------- |
| Build `ContextMemory` class with DB schema                           | 🔲 Pending | Critical | None                        |
| Implement store/query for decisions, patterns, file contexts, errors | 🔲 Pending | Critical | ContextMemory               |
| Implement confidence scoring and decay                               | 🔲 Pending | High     | ContextMemory               |
| Integrate context compilation into chat handler                      | 🔲 Pending | High     | ContextMemory, chat-handler |
| Add context search UI                                                | 🔲 Pending | Medium   | dashboard                   |

### 5.5.4 Test Impact Analysis

| Task                                               | Status     | Priority | Dependencies       |
| -------------------------------------------------- | ---------- | -------- | ------------------ |
| Build `TestImpactAnalyzer` with dependency mapping | 🔲 Pending | High     | None               |
| Implement import/require resolution                | 🔲 Pending | High     | TestImpactAnalyzer |
| Implement affected test detection                  | 🔲 Pending | High     | TestImpactAnalyzer |
| Integrate into verification gate                   | 🔲 Pending | High     | orchestrator       |
| Add test impact to PR summary                      | 🔲 Pending | Medium   | diff-summarizer    |

### 5.5.5 Decision Trail

| Task                                       | Status     | Priority | Dependencies  |
| ------------------------------------------ | ---------- | -------- | ------------- |
| Build `DecisionTrail` class with DB schema | 🔲 Pending | Critical | None          |
| Record decisions for every agent step      | 🔲 Pending | Critical | executor      |
| Implement explain-change endpoint          | 🔲 Pending | High     | DecisionTrail |
| Add trail visualization to dashboard       | 🔲 Pending | Medium   | dashboard     |
| Implement audit trail export               | 🔲 Pending | Low      | DecisionTrail |

### 5.5.6 Smart Diff Summaries

| Task                                            | Status     | Priority | Dependencies   |
| ----------------------------------------------- | ---------- | -------- | -------------- |
| Build `DiffSummarizer` with LLM integration     | 🔲 Pending | High     | chat-handler   |
| Generate summaries for every PR                 | 🔲 Pending | High     | DiffSummarizer |
| Add risk assessment and testing recommendations | 🔲 Pending | High     | DiffSummarizer |
| Format summaries for GitHub PR body             | 🔲 Pending | Medium   | DiffSummarizer |
| Add summary to agent run output                 | 🔲 Pending | Medium   | orchestrator   |

### 5.5.7 Multi-Project Context Bridge

| Task                                      | Status     | Priority | Dependencies       |
| ----------------------------------------- | ---------- | -------- | ------------------ |
| Build `CrossProjectBridge` with DB schema | 🔲 Pending | High     | None               |
| Implement pattern sharing across projects | 🔲 Pending | High     | CrossProjectBridge |
| Implement project relationship detection  | 🔲 Pending | Medium   | CrossProjectBridge |
| Generate cross-project recommendations    | 🔲 Pending | Medium   | CrossProjectBridge |
| Add bridge to dashboard                   | 🔲 Pending | Low      | dashboard          |

### 5.5.8 Developer Trust Dashboard

| Task                                                                    | Status     | Priority | Dependencies   |
| ----------------------------------------------------------------------- | ---------- | -------- | -------------- |
| Build `TrustDashboard` class                                            | 🔲 Pending | Critical | None           |
| Calculate trust metrics (acceptance rate, confidence, error rate, cost) | 🔲 Pending | Critical | TrustDashboard |
| Build activity timeline                                                 | 🔲 Pending | High     | TrustDashboard |
| Build cost breakdown view                                               | 🔲 Pending | High     | TrustDashboard |
| Build risk assessment                                                   | 🔲 Pending | High     | TrustDashboard |
| Add trust score to dashboard                                            | 🔲 Pending | Critical | dashboard      |

For detailed designs see [`docs/advanced-features.md`](./advanced-features.md)

---

## Phase 6: The Universal Engineering Brain (Long-Term Vision)

**Goal:** A system that operates autonomously across all engineering domains.

**Duration:** Ongoing  
**Status:** Vision

### 6.1 Multi-Modal Intelligence

| Task                                                                  | Status     | Priority | Dependencies |
| --------------------------------------------------------------------- | ---------- | -------- | ------------ |
| **Image Understanding**: Analyze UI screenshots for design compliance | 🔲 Pending | Medium   | None         |
| **Audio Transcription**: Process voice commands and meeting notes     | 🔲 Pending | Low      | None         |
| **Video Analysis**: Understand screen recordings for bug reproduction | 🔲 Pending | Low      | None         |

### 6.2 Team Collaboration

| Task                                                                     | Status     | Priority | Dependencies      |
| ------------------------------------------------------------------------ | ---------- | -------- | ----------------- |
| **Shared User Brain**: Team-wide knowledge sharing (opt-in)              | 🔲 Pending | Medium   | None              |
| **Code Review Collaboration**: Multiple reviewers in the loop            | 🔲 Pending | Medium   | adversarial-layer |
| **Knowledge Base**: Searchable repository of team decisions and patterns | 🔲 Pending | Medium   | semantic-layer    |

### 6.3 Enterprise Features

| Task                                                         | Status     | Priority | Dependencies |
| ------------------------------------------------------------ | ---------- | -------- | ------------ |
| **SSO Integration**: SAML/OIDC for enterprise authentication | 🔲 Pending | Medium   | None         |
| **RBAC**: Fine-grained role-based access control             | 🔲 Pending | Medium   | None         |
| **Compliance**: SOC2, GDPR, HIPAA compliance frameworks      | 🔲 Pending | Medium   | None         |
| **SLA Management**: Uptime guarantees and incident response  | 🔲 Pending | Low      | None         |

---

## Phase 7: Operational Hardening

**Goal:** Implement all recovery playbooks, monitoring, and operational scenarios.

**Duration:** 2-4 weeks  
**Status:** Pending

### 7.1 Recovery Playbooks

| Task                                                         | Status     | Priority | Dependencies     |
| ------------------------------------------------------------ | ---------- | -------- | ---------------- |
| Implement database corruption recovery (WAL replay + backup) | 🔲 Pending | Critical | backup mechanism |
| Implement cost ledger corruption recovery                    | 🔲 Pending | High     | backup mechanism |
| Implement sprint data loss recovery                          | 🔲 Pending | High     | atomic writes    |
| Implement encryption key compromise protocol                 | 🔲 Pending | Critical | key rotation     |
| Implement infinite loop recovery (kill + clear + restart)    | 🔲 Pending | Critical | loop protection  |
| Implement container escape recovery                          | 🔲 Pending | High     | sandbox layer    |

### 7.2 Monitoring & Alerting

| Task                                                         | Status     | Priority | Dependencies   |
| ------------------------------------------------------------ | ---------- | -------- | -------------- |
| Implement cost alerts at 80%/90%/100% of limit               | 🔲 Pending | Critical | cost-tracker   |
| Implement agent run failure alerts (3+ = warning, 5+ = halt) | 🔲 Pending | Critical | orchestrator   |
| Implement database health monitoring                         | 🔲 Pending | High     | connection.mjs |
| Implement disk space monitoring                              | 🔲 Pending | High     | None           |
| Implement memory usage monitoring                            | 🔲 Pending | High     | None           |
| Implement failed login attempt tracking + IP blocking        | 🔲 Pending | Critical | auth.mjs       |
| Implement infinite loop detection alerts                     | 🔲 Pending | Critical | sentinel       |
| Add Prometheus/StatsD metrics export                         | 🔲 Pending | Medium   | None           |

### 7.3 Operational Scenarios

| Task                                                        | Status     | Priority | Dependencies     |
| ----------------------------------------------------------- | ---------- | -------- | ---------------- |
| Implement offline mode + local model fallback               | 🔲 Pending | Medium   | provider-manager |
| Implement dry-run mode (preview changes before apply)       | 🔲 Pending | Medium   | orchestrator     |
| Implement AI change tracking + undo mechanism               | 🔲 Pending | Medium   | executor         |
| Implement pattern editor UI (teach AI new patterns)         | 🔲 Pending | Low      | user-brain       |
| Implement context visualization panel (see what AI injects) | 🔲 Pending | Medium   | chat-handler     |
| Implement project-specific AI behavior overrides            | 🔲 Pending | Medium   | user-brain       |
| Implement export/import brain (share patterns with team)    | 🔲 Pending | Low      | user-brain       |
| Implement multi-user project brain with conflict resolution | 🔲 Pending | Medium   | sprint-engine    |
| Implement review queue + approval for AI suggestions        | 🔲 Pending | Medium   | orchestrator     |
| Implement AI contribution dashboard                         | 🔲 Pending | Low      | cost-tracker     |

### 7.4 Compliance & Governance

| Task                                                         | Status     | Priority | Dependencies |
| ------------------------------------------------------------ | ---------- | -------- | ------------ |
| Implement SOC2 controls (audit logging, access control)      | 🔲 Pending | Medium   | None         |
| Implement GDPR compliance (data export + deletion + consent) | 🔲 Pending | Medium   | None         |
| Implement HIPAA compliance (PHI detection + encryption)      | 🔲 Pending | Low      | None         |
| Implement license scanning (detect copyrighted code)         | 🔲 Pending | Low      | None         |
| Implement mandatory human review gate for AI changes         | 🔲 Pending | Medium   | orchestrator |

### 7.5 Disaster Recovery

| Task                                               | Status     | Priority | Dependencies     |
| -------------------------------------------------- | ---------- | -------- | ---------------- |
| Implement automated backup to external storage     | 🔲 Pending | High     | None             |
| Implement password reset mechanism                 | 🔲 Pending | High     | auth.mjs         |
| Implement multi-provider failover (provider down)  | 🔲 Pending | High     | provider-manager |
| Implement config migration tool (version upgrades) | 🔲 Pending | Medium   | config.mjs       |
| Implement full data export (GDPR + migration)      | 🔲 Pending | Medium   | None             |

---

## Success Metrics

### Phase 1-2 (Foundation)

- [ ] 10+ concurrent projects without port conflicts
- [ ] User Brain captures and applies 80%+ of developer corrections
- [ ] Proxy adds <50ms latency to LLM requests
- [ ] Token optimization reduces costs by 30-60%

### Phase 3 (Autonomous)

- [ ] Sleep Loop successfully completes 70%+ of tasks without human intervention
- [ ] PR quality matches or exceeds human-written PRs
- [ ] Adversarial Layer catches 90%+ of critical issues
- [ ] Sandbox Layer prevents 100% of agent-runaway incidents

### Phase 4 (Evolution)

- [ ] Semantic Layer improves context relevance by 40%+
- [ ] Evolution Layer generates 10+ new skills per month
- [ ] Self-improving library reduces repetitive tasks by 50%+

### Phase 5 (SaaS)

- [ ] 100+ paying customers within 6 months
- [ ] 99.9% uptime SLA
- [ ] <100ms API response time (P95)
- [ ] SOC2 compliance achieved

### Phase 6 (Universal Brain)

- [ ] Multi-modal understanding across 3+ modalities
- [ ] Team collaboration adopted by 50+ engineering teams
- [ ] Enterprise features driving 60%+ of revenue

---

## Risk Register

| Risk                                 | Impact   | Probability | Mitigation                            |
| ------------------------------------ | -------- | ----------- | ------------------------------------- |
| `node:sqlite` instability in Node 22 | High     | Medium      | Fallback to better-sqlite3            |
| LLM API cost increases               | Medium   | High        | Multi-provider routing, local models  |
| Agent security vulnerabilities       | Critical | Low         | Sandbox layer, SecOps scanning        |
| User adoption barriers               | High     | Medium      | Intuitive UI, comprehensive docs      |
| Competition from established tools   | Medium   | High        | Unique Symmetry approach, local-first |

---

## Dependencies

### External Dependencies

- Node.js 22.22.3 (for `node:sqlite`)
- Python 3.x (for `ui-ux-pro-max-skill` scripts)
- Docker (for sandbox layer)
- GitHub API / `gh` CLI (for PR creation)
- Stripe API (for billing)

### Internal Dependencies

- Phase 2 depends on Phase 1 (proxy needs stable foundation)
- Phase 3 depends on Phase 2 (autonomous loop needs proxy)
- Phase 4 depends on Phase 3 (evolution needs autonomous execution)
- Phase 5 depends on Phase 1-4 (SaaS needs complete product)

---

## Next Actions

### Immediate (This Week)

1. ✅ Complete ECC integration audit
2. 🔲 Implement Header-Based Routing for multi-project context switching
3. 🔲 Build "Correction-to-Learning" pipeline for User Brain
4. 🔲 Add Tech Stack Detection for automatic project categorization

### Short-Term (Next 2 Weeks)

5. 🔲 Build the Context Proxy Gateway prototype
6. 🔲 Implement Budget Guard with hard cost caps
7. 🔲 Create first Domain Capability Pack (Security)
8. 🔲 Integrate anti-pattern guardrails into code generation

### Medium-Term (Next Month)

9. 🔲 Deploy the Adversarial Layer (Critic/Implementer)
10. 🔲 Implement the Sandbox Layer (containerized execution)
11. 🔲 Build the autonomous Sleep Loop 2.0
12. 🔲 Integrate ECC agents as Nokta step types

### Long-Term (Next Quarter)

13. 🔲 Integrate Vector DB for Semantic Layer
14. 🔲 Deploy Evolution Layer (Skill Synthesis)
15. 🔲 Launch SaaS Shell with multi-tenancy
16. 🔲 Achieve SOC2 compliance
