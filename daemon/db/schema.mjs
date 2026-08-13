import { getDb } from './connection.mjs';
import { logger } from '../lib/logger.mjs';

const _SCHEMA_VERSION = 3;

const MIGRATIONS = [
  // v1: Initial schema
  {
    up: `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    tier TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    monthly_cost_limit REAL NOT NULL DEFAULT 50.0,
    daily_token_limit INTEGER NOT NULL DEFAULT 1000000,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS provider_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    key_encrypted BLOB NOT NULL,
    key_nonce BLOB NOT NULL,
    key_tag BLOB NOT NULL,
    base_url TEXT,
    models TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cost_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    task TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cost_logs_user ON cost_logs(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cost_logs_date ON cost_logs(created_at);

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT,
    project_root TEXT,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    trigger TEXT NOT NULL DEFAULT 'manual',
    current_step INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, status);

  CREATE TABLE IF NOT EXISTS agent_run_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    config TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    output TEXT,
    error TEXT,
    duration_ms INTEGER,
    started_at TEXT,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_run_steps(run_id, step_index);

  CREATE TABLE IF NOT EXISTS sprint_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT,
    project_root TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'P2',
    status TEXT NOT NULL DEFAULT 'backlog',
    sprint_id TEXT,
    epic_id TEXT,
    initiative_id TEXT,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    related_files TEXT,
    evidence TEXT,
    dependencies TEXT,
    labels TEXT,
    storyPoints INTEGER,
    assignee TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sprint_items_user ON sprint_items(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint ON sprint_items(sprint_id);

  CREATE TABLE IF NOT EXISTS user_configs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    config TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
    down: `
  DROP TABLE IF EXISTS user_configs;
  DROP TABLE IF EXISTS sprint_items;
  DROP TABLE IF EXISTS agent_run_steps;
  DROP TABLE IF EXISTS agent_runs;
  DROP TABLE IF EXISTS cost_logs;
  DROP TABLE IF EXISTS provider_keys;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS users;
  `,
  },
  // v2: Multi-project and User Brain support
  {
    up: `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    tech_stack TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_brain (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    operational_dna TEXT NOT NULL DEFAULT '[]',
    design_preferences TEXT NOT NULL DEFAULT '{}',
    learned_patterns TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  `,
    down: `
  DROP TABLE IF EXISTS user_brain;
  DROP TABLE IF EXISTS projects;
  `,
  },
  // v3: Security hardening + Trust Architecture
  {
    up: `
  CREATE TABLE IF NOT EXISTS token_blacklist (
    token_id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

  CREATE TABLE IF NOT EXISTS model_pricing (
    model TEXT PRIMARY KEY,
    input REAL NOT NULL,
    output REAL NOT NULL,
    provider TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scope_declarations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS context_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_root TEXT NOT NULL,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    confidence REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_context_user ON context_memory(user_id, project_root, type);
  CREATE INDEX IF NOT EXISTS idx_context_key ON context_memory(key);

  CREATE TABLE IF NOT EXISTS decision_trail (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    project_root TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    action TEXT NOT NULL,
    file_path TEXT,
    reasoning TEXT NOT NULL,
    alternatives_considered TEXT DEFAULT '[]',
    confidence REAL DEFAULT 0.8,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_trail_run ON decision_trail(run_id);
  CREATE INDEX IF NOT EXISTS idx_trail_user ON decision_trail(user_id, project_root);

  CREATE TABLE IF NOT EXISTS shared_patterns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pattern_name TEXT NOT NULL,
    description TEXT NOT NULL,
    code_example TEXT,
    category TEXT NOT NULL,
    projects_used TEXT NOT NULL DEFAULT '[]',
    confidence REAL DEFAULT 0.8,
    usage_count INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_patterns_user ON shared_patterns(user_id, category);

  CREATE TABLE IF NOT EXISTS project_relationships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_a TEXT NOT NULL,
    project_b TEXT NOT NULL,
    relationship TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_projects ON project_relationships(project_a, project_b);
  `,
    down: `
  DROP TABLE IF EXISTS project_relationships;
  DROP TABLE IF EXISTS shared_patterns;
  DROP TABLE IF EXISTS decision_trail;
  DROP TABLE IF EXISTS context_memory;
  DROP TABLE IF EXISTS scope_declarations;
  DROP TABLE IF EXISTS model_pricing;
  DROP TABLE IF EXISTS token_blacklist;
  `,
  },
];

export function migrate() {
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const currentVersion = db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schema_version').get()?.v || 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    logger.info(`Running migration v${version}...`);
    db.exec(MIGRATIONS[i].up);
    db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(version);
    logger.info(`Migration v${version} complete.`);
  }

  return MIGRATIONS.length;
}

export function migrateDown(targetVersion = 0) {
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const currentVersion = db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schema_version').get()?.v || 0;

  if (currentVersion <= targetVersion) {
    logger.info(`Already at v${currentVersion}. Nothing to roll back.`);
    return currentVersion;
  }

  for (let i = currentVersion; i > targetVersion; i--) {
    logger.info(`Rolling back migration v${i}...`);
    db.exec(MIGRATIONS[i - 1].down);
    db.prepare('DELETE FROM schema_version WHERE version = ?').run(i);
    logger.info(`Rollback v${i} complete.`);
  }

  return targetVersion;
}

export function getMigrationStatus() {
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const versions = db.prepare('SELECT version, applied_at FROM schema_version ORDER BY version').all();
  const currentVersion = versions.length > 0 ? versions[versions.length - 1].version : 0;

  return {
    currentVersion,
    appliedMigrations: versions,
    totalMigrations: MIGRATIONS.length,
  };
}
