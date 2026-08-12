import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerCostRoutes(app, costTracker) {
  app.get(
    '/api/v1/costs',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { since, until } = req.query;
      const entries = await costTracker.getCosts(since, until);
      res.json({ entries, total: entries.reduce((s, e) => s + e.totalCost, 0) });
    }),
  );

  app.get(
    '/api/v1/costs/summary',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const summary = await costTracker.getSummary();
      res.json(summary);
    }),
  );

  app.get(
    '/api/v1/costs/monthly',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const monthly = await costTracker.getMonthlySpend();
      res.json(monthly);
    }),
  );

  app.get(
    '/api/v1/costs/pricing',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const pricing = costTracker.listPricing();
      res.json({ models: Object.entries(pricing).map(([model, info]) => ({ model, ...info })) });
    }),
  );

  app.post(
    '/api/v1/costs/estimate',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { model, inputTokens, outputTokens } = req.body;
      if (!model) throw new AppError('model is required', 400);
      const result = await costTracker.estimateCost(model, inputTokens || 0, outputTokens || 0);
      res.json(result);
    }),
  );
}
