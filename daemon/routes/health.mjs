import { asyncHandler } from '../lib/route-utils.mjs';

export function registerHealthRoute(app, providerManager) {
  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const health = await providerManager.health();
      const providers = providerManager.list();
      res.json({
        status: 'ok',
        version: '0.3.0',
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          healthy: health[p.id]?.status === 'ok',
        })),
        defaultProvider: providerManager.getDefault()?.id || null,
        autoRoute: true,
      });
    }),
  );
}
