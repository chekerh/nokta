# Skills Mapping for Nokta Audit Remediation

**Generated**: 2026-09-28  
**Purpose**: Map available skills to each audit remediation task

---

## Available Skills in `/Users/mac/skills`

### Core Engineering Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `golang-patterns` | `/Users/mac/skills/ECC/skills/golang-patterns` | Go patterns (not directly applicable) |
| `rust-patterns` | `/Users/mac/skills/ECC/skills/rust-patterns` | Rust patterns (not directly applicable) |
| `python-patterns` | `/Users/mac/skills/ECC/skills/python-patterns` | Python patterns (not directly applicable) |
| `typescript-patterns` | Need to check | TypeScript patterns |
| `nodejs-patterns` | Need to check | Node.js patterns |

### Architecture Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `hexagonal-architecture` | `/Users/mac/skills/ECC/docs/zh-CN/skills/hexagonal-architecture/SKILL.md` | **HIGH** - Ports & adapters for DI container |
| `context-engineering` | `/Users/mac/.config/opencode/skills/context-engineering` | **HIGH** - Optimize context flow to agents |
| `parallel-execution-optimizer` | `/Users/mac/skills/ECC/docs/zh-CN/skills/parallel-execution-optimizer/SKILL.md` | **HIGH** - Worker pool, concurrent execution |
| `autonomous-loops` | `/Users/mac/skills/ECC/docs/zh-CN/skills/autonomous-loops/SKILL.md` | **MEDIUM** - Agent loop patterns |
| `continuous-agent-loop` | `/Users/mac/skills/ECC/docs/zh-CN/skills/continuous-agent-loop/SKILL.md` | **MEDIUM** - Quality gates, recovery |

### Database Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `database-migrations` | `/Users/mac/skills/ECC/docs/zh-CN/skills/database-migrations/SKILL.md` | **HIGH** - Schema evolution, migrations |
| `postgres-patterns` | `/Users/mac/skills/ECC/skills/postgres-patterns` | **HIGH** - Query optimization, patterns |
| `prisma-patterns` | `/Users/mac/skills/ECC/skills/prisma-patterns` | **MEDIUM** - ORM patterns (if adopting) |
| `redis-patterns` | `/Users/mac/skills/ECC/skills/redis-patterns` | **MEDIUM** - Caching, rate limiting |

### Security Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `security-review` | `/Users/mac/skills/ECC/docs/ko-KR/skills/security-review/SKILL.md` | **HIGH** - Auth, input handling, secrets |
| `security-bounty-hunter` | `/Users/mac/skills/ECC/docs/zh-CN/skills/security-bounty-hunter/SKILL.md` | **HIGH** - Vulnerability hunting |
| `security-scan` | `/Users/mac/skills/ECC/skills/security-scan` | **HIGH** - Config audit |
| `django-security` | `/Users/mac/skills/ECC/skills/django-security` | Not applicable |
| `springboot-security` | `/Users/mac/skills/ECC/docs/zh-CN/skills/springboot-security/SKILL.md` | Not applicable |

### Testing Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `tdd-workflow` | `/Users/mac/skills/ECC/docs/ko-KR/skills/tdd-workflow/SKILL.md` | **HIGH** - Test-first methodology |
| `ai-regression-testing` | `/Users/mac/skills/ECC/docs/zh-CN/skills/ai-regression-testing/SKILL.md` | **HIGH** - AI-assisted regression testing |
| `golang-testing` | `/Users/mac/skills/ECC/docs/ko-KR/skills/golang-testing/SKILL.md` | Not applicable |
| `rust-testing` | `/Users/mac/skills/ECC/docs/zh-CN/skills/rust-testing/SKILL.md` | Not applicable |
| `python-testing` | `/Users/mac/skills/ECC/docs/tr/skills/python-testing/SKILL.md` | Not applicable |

### Observability Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `dashboard-builder` | `/Users/mac/skills/ECC/skills/dashboard-builder` | **MEDIUM** - Prometheus/Grafana dashboards |
| `canary-watch` | `/Users/mac/skills/ECC/skills/canary-watch` | **MEDIUM** - Post-deploy verification |
| `production-audit` | `/Users/mac/skills/ECC/skills/production-audit` | **HIGH** - Production readiness |

### API/Integration Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `api-design` | `/Users/mac/skills/ECC/docs/zh-CN/skills/api-design/SKILL.md` | **HIGH** - REST API design |
| `contract-first` | `/Users/mac/skills/ECC/skills/contract-first` | **HIGH** - Schema-first development |
| `documentation-lookup` | `/Users/mac/skills/ECC/skills/documentation-lookup` | **MEDIUM** - Current docs |
| `mcp-server-patterns` | `/Users/mac/skills/ECC/docs/zh-CN/skills/mcp-server-patterns/SKILL.md` | **MEDIUM** - MCP integration |

### Code Quality Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `ponytail` | `/Users/mac/skills/ponytail/skills/ponytail` | **HIGH** - Simplify, remove dead code |
| `ponytail-audit` | `/Users/mac/skills/ponytail/skills/ponytail-audit` | **HIGH** - Whole-repo over-engineering audit |
| `code-reviewer` | `/Users/mac/skills/SkillSpector/tests/fixtures/ssd/ssd_clean/SKILL.md` | **MEDIUM** - Code review |
| `plankton-code-quality` | `/Users/mac/skills/ECC/skills/plankton-code-quality` | **MEDIUM** - Auto-format/lint on edit |

### Refactoring Skills

| Skill | Path | Relevance |
|-------|------|-----------|
| `refactor-cleaner` | Agent type | **HIGH** - Dead code removal, consolidation |
| `orch-refine-code` | `/Users/mac/skills/ECC/skills/orch-refine-code/SKILL.md` | **HIGH** - Behavior-preserving refactor |
| `orch-change-feature` | `/Users/mac/skills/ECC/skills/orch-change-feature/SKILL.md` | **HIGH** - Change existing behavior |

---

## Task-to-Skill Mapping

### Phase 1: Immediate (Week 1)

| Task | Primary Skill | Secondary Skills |
|------|---------------|------------------|
| Add missing CLI commands | `golang-patterns` (CLI structure) | `documentation-lookup` |
| Verify admin route | `api-design` | `security-review` |
| Zod validation on routes | `api-design` | `contract-first` |
| Pagination on list endpoints | `api-design` | `golang-patterns` |
| SSE auth fix | `api-design` | `security-review` |

### Phase 2: Architecture (Week 2-3)

| Task | Primary Skill | Secondary Skills |
|------|---------------|------------------|
| Service container / DI | `hexagonal-architecture` | `context-engineering` |
| Split orchestrator | `orch-refine-code` | `refactor-cleaner` |
| Worker pool replacement | `parallel-execution-optimizer` | `autonomous-loops` |
| Query builder (Kysely) | `database-migrations` | `postgres-patterns` |

### Phase 3: Security (Week 3-4)

| Task | Primary Skill | Secondary Skills |
|------|---------------|------------------|
| JWT key rotation | `security-review` | `security-bounty-hunter` |
| Refresh token flow | `security-review` | `api-design` |
| Login rate limiting | `security-review` | `redis-patterns` |
| Password reset | `security-review` | `api-design` |

### Phase 4: Observability (Month 2)

| Task | Primary Skill | Secondary Skills |
|------|---------------|------------------|
| Health checks | `production-audit` | `canary-watch` |
| Prometheus metrics | `dashboard-builder` | `monitor` patterns |
| Distributed tracing | `context-engineering` | `api-design` |
| OpenAPI types | `documentation-lookup` | `api-design` |

---

## Skill Loading Instructions

```bash
# Load a skill for a specific task
# Use the skill tool with the skill name

# Example: Load hexagonal-architecture for DI container task
skill hexagonal-architecture

# Example: Load security-review for JWT rotation
skill security-review

# Example: Load parallel-execution-optimizer for worker pool
skill parallel-execution-optimizer
```

---

## Skill Priority Matrix

| Priority | Skills | When to Load |
|----------|--------|--------------|
| **Critical** | `hexagonal-architecture`, `security-review`, `api-design`, `database-migrations`, `parallel-execution-optimizer` | Phase 1-2 start |
| **High** | `orch-refine-code`, `refactor-cleaner`, `tdd-workflow`, `contract-first`, `context-engineering` | Phase 2-3 |
| **Medium** | `dashboard-builder`, `canary-watch`, `production-audit`, `documentation-lookup`, `mcp-server-patterns` | Phase 3-4 |
| **Low** | `ponytail`, `ponytail-audit`, `plankton-code-quality`, `continuous-agent-loop` | Ongoing |

---

## Quick Reference: Skill Commands

```bash
# For each major task, load the relevant skill first:

# DI Container / Architecture
skill hexagonal-architecture

# Security tasks
skill security-review

# API design / validation
skill api-design

# Database migrations / queries
skill database-migrations

# Concurrent execution / worker pools
skill parallel-execution-optimizer

# Test-first development
skill tdd-workflow

# Refactoring
skill orch-refine-code

# Code simplification
skill ponytail

# Observability
skill dashboard-builder
skill production-audit

# Contract-first development
skill contract-first
```

---

## Notes for Cheaper Model

1. **Load ONE skill at a time** per task - don't overload context
2. **Read the SKILL.md fully** before starting the task
3. **Apply the skill's methodology** exactly as described
4. **Verify with tests** after each change
5. **Don't skip skills** - they encode hard-won patterns

### Example Workflow for "JWT Key Rotation" Task:

```bash
# 1. Load security skill
skill security-review

# 2. Read the skill file for patterns
# 3. Implement following the skill's methodology
# 4. Write tests first (tdd-workflow)
# 5. Run tests, lint
# 6. Commit
```

---

## Skill Installation Status

All skills listed are in `/Users/mac/skills/` or `/Users/mac/.config/opencode/skills/`. No additional installation needed.

### To Discover More Skills:
```bash
ls /Users/mac/skills/
ls /Users/mac/.config/opencode/skills/
```

---

## Skill Gaps (May Need External Skills)

| Needed Capability | Current Gap | Suggested Action |
|-------------------|-------------|------------------|
| Kysely/Type-safe SQL | No specific skill | Use `database-migrations` + `documentation-lookup` |
| Worker threads pool | No specific skill | Use `parallel-execution-optimizer` + Node.js docs |
| OpenTelemetry tracing | No specific skill | Use `context-engineering` + `documentation-lookup` |
| Prometheus client | No specific skill | Use `dashboard-builder` + `documentation-lookup` |
| Zod schema validation | No specific skill | Use `api-design` + `contract-first` |