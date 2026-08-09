import { prepare } from '../db/connection.mjs';

export class DecisionTrail {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  record(runId, userId, projectRoot, decision) {
    const id = 'trail-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    prepare(
      'INSERT INTO decision_trail (id, run_id, user_id, project_root, step_index, action, file_path, reasoning, alternatives_considered, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      runId,
      userId,
      projectRoot,
      decision.stepIndex,
      decision.action,
      decision.filePath || null,
      decision.reasoning,
      JSON.stringify(decision.alternatives || []),
      decision.confidence || 0.8,
    );
    return id;
  }

  updateOutcome(trailId, outcome) {
    prepare('UPDATE decision_trail SET outcome = ? WHERE id = ?').run(outcome, trailId);
  }

  getTrail(runId) {
    return prepare('SELECT * FROM decision_trail WHERE run_id = ? ORDER BY step_index')
      .all(runId)
      .map((row) => ({ ...row, alternatives_considered: JSON.parse(row.alternatives_considered || '[]') }));
  }

  getProjectTrailSummary(projectRoot, limit = 50) {
    return prepare(`
      SELECT action, COUNT(*) as count, AVG(confidence) as avg_confidence,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures
      FROM decision_trail WHERE project_root = ? GROUP BY action ORDER BY count DESC LIMIT ?
    `).all(projectRoot, limit);
  }

  getFileDecisions(filePath, limit = 20) {
    return prepare('SELECT * FROM decision_trail WHERE file_path = ? ORDER BY created_at DESC LIMIT ?')
      .all(filePath, limit)
      .map((row) => ({ ...row, alternatives_considered: JSON.parse(row.alternatives_considered || '[]') }));
  }

  explainChange(filePath) {
    const decisions = this.getFileDecisions(filePath, 1);
    if (decisions.length > 0) {
      return {
        reasoning: decisions[0].reasoning,
        alternatives: decisions[0].alternatives_considered,
        confidence: decisions[0].confidence,
        outcome: decisions[0].outcome,
        decidedAt: decisions[0].created_at,
      };
    }
    return { reasoning: 'No recorded decision for this change', alternatives: [], confidence: 0, outcome: 'unknown' };
  }
}
