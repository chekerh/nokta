import { asyncHandler } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { TrustDashboard } from '../lib/trust-dashboard.mjs';

export function registerTrustRoutes(app) {
  const dashboard = new TrustDashboard();

  app.get(
    '/api/v1/trust/metrics',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id || 'anonymous';
      const projectRoot = req.query.project || process.cwd();
      const metrics = dashboard.getTrustMetrics(userId, projectRoot);
      res.json(metrics);
    }),
  );

  app.get(
    '/api/v1/trust/timeline',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id || 'anonymous';
      const projectRoot = req.query.project || process.cwd();
      const limit = parseInt(req.query.limit || '20', 10);
      const timeline = dashboard.getActivityTimeline(userId, projectRoot, limit);
      res.json({ timeline });
    }),
  );

  app.get(
    '/api/v1/trust/costs',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id || 'anonymous';
      const days = parseInt(req.query.days || '30', 10);
      const breakdown = dashboard.getCostBreakdown(userId, days);
      res.json({ breakdown });
    }),
  );

  app.get(
    '/api/v1/trust/risks',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id || 'anonymous';
      const projectRoot = req.query.project || process.cwd();
      const risks = dashboard.getRiskAssessment(userId, projectRoot);
      res.json({ risks });
    }),
  );
}
