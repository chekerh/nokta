import { prepare } from '../db/connection.mjs';

export class TrustDashboard {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  getTrustMetrics(userId, projectRoot) {
    const metrics = {};

    const totalRuns = prepare('SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND project_root = ?').get(
      userId,
      projectRoot,
    );
    const completedRuns = prepare(
      'SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND project_root = ? AND status = ?',
    ).get(userId, projectRoot, 'completed');
    metrics.acceptanceRate = totalRuns.count > 0 ? Math.round((completedRuns.count / totalRuns.count) * 100) : 0;

    const avgConfidence = prepare(
      'SELECT AVG(confidence) as avg FROM decision_trail WHERE user_id = ? AND project_root = ?',
    ).get(userId, projectRoot);
    metrics.averageConfidence = Math.round((avgConfidence.avg || 0) * 100);

    const errorRuns = prepare(
      'SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND project_root = ? AND status = ?',
    ).get(userId, projectRoot, 'failed');
    metrics.errorRate = totalRuns.count > 0 ? Math.round((errorRuns.count / totalRuns.count) * 100) : 0;

    const costLogs = prepare(
      'SELECT SUM(cost) as total_cost, SUM(tokens_in + tokens_out) as total_tokens FROM cost_logs WHERE user_id = ?',
    ).get(userId);
    metrics.totalCost = costLogs.total_cost || 0;
    metrics.totalTokens = costLogs.total_tokens || 0;

    metrics.trustScore = Math.round(
      metrics.acceptanceRate * 0.3 +
        metrics.averageConfidence * 0.2 +
        (100 - metrics.errorRate) * 0.25 +
        metrics.acceptanceRate * 0.25,
    );

    return metrics;
  }

  getActivityTimeline(userId, projectRoot, limit = 20) {
    return prepare(`
      SELECT r.id, r.goal, r.status, r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM agent_run_steps WHERE run_id = r.id) as step_count
      FROM agent_runs r
      WHERE r.user_id = ? AND r.project_root = ?
      ORDER BY r.created_at DESC LIMIT ?
    `).all(userId, projectRoot, limit);
  }

  getCostBreakdown(userId, days = 30) {
    return prepare(`
      SELECT provider, model, SUM(cost) as total_cost, SUM(tokens_in + tokens_out) as total_tokens, COUNT(*) as request_count
      FROM cost_logs WHERE user_id = ? AND created_at >= datetime('now', '-${days} days')
      GROUP BY provider, model ORDER BY total_cost DESC
    `).all(userId);
  }

  getRiskAssessment(userId, projectRoot) {
    const risks = [];
    const failedRuns = prepare(
      "SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND project_root = ? AND status = 'failed' AND created_at >= datetime('now', '-7 days')",
    ).get(userId, projectRoot);

    if (failedRuns.count > 5) {
      risks.push({
        type: 'reliability',
        severity: 'HIGH',
        message: `${failedRuns.count} failed runs in the last 7 days`,
        recommendation: 'Review failed runs for patterns',
      });
    }
    return risks;
  }
}
