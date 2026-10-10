# Database Schema Audit

**Generated**: 2026-09-28  
**Scope**: SQLite schema in `daemon/db/schema.mjs` (v3, 3 migrations)

---

## Schema Overview

| Table | Purpose | Rows (est.) | Indexes |
|-------|---------|-------------|---------|
| `users` | User accounts | - | email (unique), idx_cost_logs_user |
| `sessions` | JWT sessions | - | token (unique) |
| `provider_keys` | Encrypted LLM API keys | - | - |
| `cost_logs` | LLM usage tracking | - | user+date, date |
| `agent_runs` | Agent run records | - | user+status |
| `agent_run_steps` | Individual step results | - | run+step_index |
| `sprint_items` | Sprint/backlog items | - | user+status, sprint_id |
| `user_configs` | User preferences JSON | - | - |
| `projects` | Project registry | - | user |
| `user_brain` | Learned patterns/preferences | - | - |
| `token_blacklist` | Revoked JWT tokens | - | expires_at |
| `model_pricing` | LLM pricing catalog | - | - |
| `scope_declarations` | Run scope records | - | - |
| `context_memory` | Cross-project memory | - | user+project+type, key |
| `decision_trail` | Decision audit trail | - | run_id, user+project |
| `shared_patterns` | Reusable code patterns | - | user+category |
| `project_relationships` | Project graph | - | project_a+b |

---

## Migration History

| Version | Description | Tables Added |
|---------|-------------|--------------|
| v1 | Initial schema (users, sessions, provider_keys, cost_logs, agent_runs, agent_run_steps, sprint_items, user_configs) | 8 |
| v2 | Multi-project + User Brain (projects, user_brain) | 2 |
| v3 | Security + Trust Architecture (token_blacklist, model_pricing, scope_declarations, context_memory, decision_trail, shared_patterns, project_relationships) | 7 |

**Total**: 17 tables, 15 indexes

---

## Schema Analysis

### Strengths
1. **Explicit migrations** with up/down for rollback
2. **Foreign keys** with CASCADE deletes (referential integrity)
3. **Indexes** on common query patterns (user_id, status, run_id)
3. **Schema version tracking** table for migration state
4. **Rollback support** via `migrateDown()`

### Issues

#### Critical
1. **No NOT NULL enforcement on critical columns**:
   - `agent_runs.goal` - NOT NULL ✓
   - `agent_runs.user_id` - NOT NULL ✓
   - But `project_id` nullable - could be required for multi-tenancy

2. **TEXT for JSON columns** - No validation:
   - `agent_runs.metadata` - stores arbitrary JSON
   - `agent_run_steps.config` - step configuration as TEXT
   - `agent_run_steps.output` - can be object (review summary) → **BUG: SQLite can't bind objects**
   - `sprint_items.related_files`, `evidence`, `dependencies`, `labels` - all TEXT JSON
   - `user_brain.*` - all TEXT JSON
   - `context_memory.value`, `metadata` - TEXT JSON
   - `decision_trail.alternatives_considered` - TEXT JSON
   - `shared_patterns.projects_used` - TEXT JSON
   - `project_relationships.metadata` - TEXT JSON

3. **No CHECK constraints** for enum-like columns:
   - `agent_runs.status` - should be enum (created, running, completed, failed, cancelled)
   - `agent_run_steps.status` - should be enum (pending, running, completed, failed, skipped)
   - `agent_runs.trigger` - should be enum (manual, auto, scheduled, webhook)
   - `sprint_items.priority` - should be enum (P0, P1, P2, P3)
   - `sprint_items.status` - should be enum (backlog, sprint, done, blocked)
   - `provider_keys.enabled` - INTEGER but should be 0/1

4. **No updated_at triggers** - Relies on application to update timestamps

5. **SQLite limitations**:
   - No native UUID type (using TEXT)
   - No native JSON type (using TEXT, no JSON1 extension used)
   - No advisory locks for distributed coordination

#### High
6. **Cost logs**: No partitioning/archiving strategy - will grow unbounded
7. **Token blacklist**: No TTL cleanup job (only index on expires_at)
8. **Scope declarations**: Table exists but not clear if used
9. **Model pricing**: Hardcoded, no auto-update from provider APIs

#### Medium
9. **Indexes**: Missing composite indexes for common queries:
   - `agent_runs(user_id, created_at DESC)` for pagination
   - `agent_run_steps(run_id, status)` for filtering
   - `cost_logs(user_id, provider, created_at)` for billing queries

10. **Connection pooling**: `connection.mjs` uses single connection (better-sqlite3 is synchronous)

#### Low
11. **No full-text search** for context_memory, decision_trail
12. **No audit log table** separate from decision_trail

---

## Connection Management (`daemon/db/connection.mjs`)

```javascript
// Single connection, no pooling
let _db = null;
export function getDb() {
  if (!_db) {
    _db = new Database(dbPath, { fileMustExist: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}
```

**Issues**:
- Single global connection (better-sqlite3 is synchronous, blocks event loop)
- No read/write separation
- No connection timeout handling
- WAL mode good for concurrency but single writer

---

## Usage Patterns in Codebase

### Direct SQL (Raw) - Found in:
| File | Pattern | Risk |
|------|---------|------|
| `db-storage.mjs` | `db.prepare().run()`, `.get()`, `.all()` | Medium - parameterized ✓ |
| `agent-pack.mjs` | Direct SQL for pack loading | Low - read only |
| `scope-enforcer.mjs` | None (uses db-storage) | - |
| `orchestrator.mjs` | Via db-storage | - |

### Parameterized Queries ✓
All usages use `?` placeholders - **no SQL injection risk**

### JSON Serialization Bug
In `db-storage.mjs`:
```javascript
// Before fix (causes "Provided value cannot be bound to SQLite parameter 2")
.run(stepResult.status, stepResult.output || null, ...)

// After fix (serializes objects)
.run(stepResult.status, bindableOutput(stepResult.output), ...)
```

---

## Recommendations

### Immediate
1. **Add CHECK constraints** for enum columns (requires migration v4)
2. **Add JSON1 extension usage** for JSON columns (SQLite 3.38+)
3. **Fix timestamp triggers** or document app responsibility

### Short-term
4. **Add composite indexes** for pagination queries
5. **Implement cost_logs archival** (monthly partitions or separate table)
6. **Add token_blacklist cleanup job** (cron or scheduled)

### Medium-term
7. **Consider query builder** (Knex, Kysely, or Drizzle) for type safety
8. **Add connection pooling** if moving to async driver (libsql, postgres)
9. **Implement read replicas** for read-heavy endpoints (list runs, costs)

### Schema Evolution (v4 Migration)
```sql
-- Add CHECK constraints
ALTER TABLE agent_runs ADD CONSTRAINT chk_status 
  CHECK (status IN ('created','running','completed','failed','cancelled'));
ALTER TABLE agent_run_steps ADD CONSTRAINT chk_step_status 
  CHECK (status IN ('pending','running','completed','failed','skipped'));
ALTER TABLE sprint_items ADD CONSTRAINT chk_priority 
  CHECK (priority IN ('P0','P1','P2','P3'));
ALTER TABLE sprint_items ADD CONSTRAINT chk_sprint_status 
  CHECK (status IN ('backlog','sprint','done','blocked'));

-- Add JSON1 virtual columns for querying
ALTER TABLE agent_runs ADD COLUMN metadata_json AS (json(metadata));
ALTER TABLE agent_run_steps ADD COLUMN config_json AS (json(config));

-- Add updated_at triggers
CREATE TRIGGER trg_agent_runs_updated 
  AFTER UPDATE ON agent_runs 
  BEGIN UPDATE agent_runs SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

---

## Test Coverage

| Test File | Tables Covered | Notes |
|-----------|----------------|-------|
| `tests/schema.test.mjs` | All | Migration up/down, version tracking |
| `tests/agent-run-db.test.mjs` | agent_runs, agent_run_steps | 29 tests, covers CRUD + review fix |
| `tests/auth.test.mjs` | users, sessions | Auth flows |

**Gap**: No tests for v3 tables (context_memory, decision_trail, shared_patterns, project_relationships)