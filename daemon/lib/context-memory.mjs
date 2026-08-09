import { prepare } from '../db/connection.mjs';

export class ContextMemory {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  storeDecision(userId, projectRoot, decision) {
    return this.store(userId, projectRoot, 'decision', decision.key, decision.value, {
      reason: decision.reason,
      alternatives: decision.alternatives,
    });
  }

  storeFileContext(userId, projectRoot, filePath, context) {
    return this.store(userId, projectRoot, 'file_context', filePath, context.summary, {
      patterns: context.patterns,
      dependencies: context.dependencies,
    });
  }

  storePattern(userId, projectRoot, pattern) {
    return this.store(userId, projectRoot, 'pattern', pattern.name, pattern.description, {
      examples: pattern.examples,
      category: pattern.category,
    });
  }

  storeError(userId, projectRoot, error) {
    return this.store(userId, projectRoot, 'error', error.message, error.fix, {
      stackTrace: error.stackTrace,
    });
  }

  store(userId, projectRoot, type, key, value, metadata = {}) {
    const existing = prepare(
      'SELECT id FROM context_memory WHERE user_id = ? AND project_root = ? AND type = ? AND key = ?',
    ).get(userId, projectRoot, type, key);

    if (existing) {
      prepare(
        "UPDATE context_memory SET value = ?, metadata = ?, confidence = MIN(1.0, confidence + 0.1), access_count = access_count + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(value, JSON.stringify(metadata), existing.id);
      return existing.id;
    }

    const id = 'ctx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    prepare(
      'INSERT INTO context_memory (id, user_id, project_root, type, key, value, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, userId, projectRoot, type, key, value, JSON.stringify(metadata));
    return id;
  }

  query(userId, projectRoot, options = {}) {
    const { type, key, limit = 10, minConfidence = 0.5 } = options;
    let sql = 'SELECT * FROM context_memory WHERE user_id = ? AND project_root = ? AND confidence >= ?';
    const params = [userId, projectRoot, minConfidence];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (key) {
      sql += ' AND key LIKE ?';
      params.push(`%${key}%`);
    }

    sql += ' ORDER BY confidence DESC, access_count DESC LIMIT ?';
    params.push(limit);

    const results = prepare(sql).all(...params);
    for (const r of results) {
      prepare('UPDATE context_memory SET access_count = access_count + 1 WHERE id = ?').run(r.id);
    }
    return results.map((r) => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }

  compileFileContext(userId, projectRoot, filePath) {
    const fileContext = this.query(userId, projectRoot, { type: 'file_context', key: filePath, limit: 1 });
    const decisions = this.query(userId, projectRoot, { type: 'decision', limit: 5 });
    const patterns = this.query(userId, projectRoot, { type: 'pattern', limit: 10 });
    const errors = this.query(userId, projectRoot, { type: 'error', limit: 5 });

    return {
      file: fileContext[0] || null,
      decisions: decisions.map((d) => d.value),
      patterns: patterns.map((p) => p.value),
      recentErrors: errors.map((e) => ({ error: e.key, fix: e.value })),
    };
  }

  decay(maxAgeDays = 90) {
    prepare(
      `UPDATE context_memory SET confidence = confidence * 0.95 WHERE created_at < datetime('now', '-${maxAgeDays} days')`,
    ).run();
  }
}
