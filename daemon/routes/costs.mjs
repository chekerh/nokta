import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { parsePagination, paginationMeta } from '../lib/route-utils.mjs';
import { validateBody } from '../lib/validate.mjs';
import { CostEstimateSchema } from '../lib/schemas.mjs';

export function registerCostRoutes(app, costTracker) {
  app.get(
    '/api/v1/costs',
    asyncHandler(async (req, res) => {
      const { since, until } = req.query;
      const entries = await costTracker.getCosts(since, until);
      const { page, limit, enabled } = parsePagination(req.query);
      // `total` stays the whole-range spend even when the page is sliced.
      const total = entries.reduce((s, e) => s + e.totalCost, 0);
      const pageEntries = enabled ? entries.slice((page - 1) * limit, page * limit) : entries;
      res.json({
        entries: pageEntries,
        total,
        ...(enabled ? { pagination: paginationMeta(entries.length, { page, limit }) } : {}),
      });
    }),
  );

  app.get(
    '/api/v1/costs/summary',
    asyncHandler(async (req, res) => {
      const summary = await costTracker.getSummary();
      res.json(summary);
    }),
  );

  app.get(
    '/api/v1/costs/monthly',
    asyncHandler(async (req, res) => {
      const monthly = await costTracker.getMonthlySpend();
      res.json(monthly);
    }),
  );

  app.get(
    '/api/v1/costs/pricing',
    asyncHandler(async (req, res) => {
      const pricing = costTracker.listPricing();
      res.json({ models: Object.entries(pricing).map(([model, info]) => ({ model, ...info })) });
    }),
  );

  app.post(
    '/api/v1/costs/estimate',
    validateBody(CostEstimateSchema),
    asyncHandler(async (req, res) => {
      const { model, inputTokens, outputTokens } = req.body;
      if (!model) throw new AppError('model is required', 400);
      const result = await costTracker.estimateCost(model, inputTokens || 0, outputTokens || 0);
      res.json(result);
    }),
  );
}
