import { prepare } from '../db/connection.mjs';
import { readFileSync } from 'node:fs';

export class CrossProjectBridge {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  recordPatternUsage(userId, projectRoot, patternName, description, codeExample, category) {
    const existing = prepare(
      'SELECT id, projects_used FROM shared_patterns WHERE user_id = ? AND pattern_name = ? AND category = ?',
    ).get(userId, patternName, category);

    if (existing) {
      const projects = JSON.parse(existing.projects_used || '[]');
      if (!projects.includes(projectRoot)) projects.push(projectRoot);
      prepare(
        "UPDATE shared_patterns SET projects_used = ?, usage_count = usage_count + 1, confidence = MIN(1.0, confidence + 0.05), updated_at = datetime('now') WHERE id = ?",
      ).run(JSON.stringify(projects), existing.id);
    } else {
      const id = 'pat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      prepare(
        'INSERT INTO shared_patterns (id, user_id, pattern_name, description, code_example, category, projects_used) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, userId, patternName, description, codeExample, category, JSON.stringify([projectRoot]));
    }
  }

  getRelevantPatterns(userId, currentProject, category, limit = 10) {
    return prepare(
      'SELECT * FROM shared_patterns WHERE user_id = ? AND category = ? AND projects_used NOT LIKE ? ORDER BY confidence DESC, usage_count DESC LIMIT ?',
    )
      .all(userId, category, `%${currentProject}%`, limit)
      .map((row) => ({ ...row, projects_used: JSON.parse(row.projects_used || '[]') }));
  }

  detectRelationships(userId, projectA, projectB) {
    const relationships = [];
    try {
      const pkgA = JSON.parse(readFileSync(`${projectA}/package.json`, 'utf8'));
      const pkgB = JSON.parse(readFileSync(`${projectB}/package.json`, 'utf8'));
      const depsA = new Set([...Object.keys(pkgA.dependencies || {}), ...Object.keys(pkgA.devDependencies || {})]);
      const depsB = new Set([...Object.keys(pkgB.dependencies || {}), ...Object.keys(pkgB.devDependencies || {})]);
      const shared = [...depsA].filter((d) => depsB.has(d));
      if (shared.length > 0) {
        relationships.push({ type: 'shared_dependency', metadata: { sharedDeps: shared } });
      }
    } catch {}

    for (const rel of relationships) {
      const id = 'rel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      prepare(
        'INSERT OR IGNORE INTO project_relationships (id, user_id, project_a, project_b, relationship, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, userId, projectA, projectB, rel.type, JSON.stringify(rel.metadata));
    }
    return relationships;
  }

  getRecommendations(userId, currentProject) {
    const recommendations = [];
    const relationships = prepare(
      'SELECT * FROM project_relationships WHERE user_id = ? AND (project_a = ? OR project_b = ?)',
    ).all(userId, currentProject, currentProject);

    for (const rel of relationships) {
      const otherProject = rel.project_a === currentProject ? rel.project_b : rel.project_a;
      const patterns = prepare('SELECT * FROM shared_patterns WHERE user_id = ? AND projects_used LIKE ?').all(
        userId,
        `%${otherProject}%`,
      );

      for (const pattern of patterns) {
        const projects = JSON.parse(pattern.projects_used || '[]');
        if (!projects.includes(currentProject)) {
          recommendations.push({
            pattern: pattern.pattern_name,
            description: pattern.description,
            codeExample: pattern.code_example,
            fromProject: otherProject,
            reason: `Used in ${rel.relationship} project`,
          });
        }
      }
    }
    return recommendations;
  }
}
