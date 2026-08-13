import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerProviderRoutes(app, providerManager) {
  // List providers (load from DB if user is authenticated)
  app.get(
    '/api/v1/providers',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      if (req.user) {
        // Re-init from DB for this user if needed
        if (providerManager.getDbUser() !== req.user.id) {
          providerManager.setDbUser(req.user.id);
          await providerManager.initDefaults(req.user.id);
        }
      }
      res.json({ providers: providerManager.list() });
    }),
  );

  app.get(
    '/api/v1/providers/health',
    asyncHandler(async (req, res) => {
      const health = await providerManager.health();
      res.json(health);
    }),
  );

  app.post(
    '/api/v1/providers/default',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { id } = req.body;
      if (!id) throw new AppError('Provider ID is required', 400);
      if (req.user) providerManager.setDbUser(req.user.id);
      await providerManager.setDefault(id);
      res.json({ success: true, defaultProvider: id });
    }),
  );

  app.post(
    '/api/v1/providers/auto-route',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { enabled } = req.body;
      if (req.user) providerManager.setDbUser(req.user.id);
      await providerManager.setAutoRoute(enabled !== false);
      res.json({ autoRoute: enabled !== false });
    }),
  );

  app.post(
    '/api/v1/providers/configure',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { id, apiKey, baseUrl, models, enabled } = req.body;
      if (!id) throw new AppError('Provider ID is required', 400);
      if (req.user) providerManager.setDbUser(req.user.id);
      await providerManager.configure(id, { apiKey, baseUrl, models, enabled });
      res.json({ success: true, provider: providerManager.get(id)?.toJSON() });
    }),
  );

  app.delete(
    '/api/v1/providers/:id',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const existing = providerManager.get(id);
      if (!existing) throw new AppError('Provider not found', 404);
      if (req.user) providerManager.setDbUser(req.user.id);
      existing.enabled = false;
      if (providerManager._defaultProvider === id) {
        const remaining = providerManager.list().filter((p) => p.id !== id);
        providerManager._defaultProvider = remaining.length > 0 ? remaining[0].id : null;
      }
      await providerManager.saveConfig();
      res.json({ success: true });
    }),
  );

  app.patch(
    '/api/v1/providers/:id',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { apiKey, baseUrl, models, enabled, maxTokens, temperature } = req.body;
      const existing = providerManager.get(id);
      if (!existing) throw new AppError('Provider not found', 404);
      if (req.user) providerManager.setDbUser(req.user.id);
      if (apiKey !== undefined) existing.apiKey = apiKey;
      if (baseUrl !== undefined) existing.baseUrl = baseUrl;
      if (models !== undefined) existing.models = models;
      if (enabled !== undefined) existing.enabled = enabled;
      if (maxTokens !== undefined) existing.maxTokens = maxTokens;
      if (temperature !== undefined) existing.temperature = temperature;
      await providerManager.saveConfig();
      res.json({ success: true, provider: existing.toJSON() });
    }),
  );
}
