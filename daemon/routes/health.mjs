import { asyncHandler } from '../lib/route-utils.mjs';
import { checkAll } from '../lib/health.mjs';

const routeRegistry = new Set();

export function trackRoute(name) {
  routeRegistry.add(name);
}

export function registerHealthRoute(app, providerManager) {
  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const health = await providerManager.health();
      const providers = providerManager.list();
      const dependencies = await checkAll({ providerManager, providerHealth: health });
      // Top-level status tracks process readiness (db + disk). Provider
      // reachability lives in dependencies.providers: instance health checks
      // should keep failing over while a model provider is down, not mark the
      // whole daemon unhealthy.
      const coreOk = dependencies.database.status === 'ok' && dependencies.disk.status === 'ok';
      res.json({
        status: coreOk ? 'ok' : 'degraded',
        version: '0.3.0',
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          healthy: health[p.id]?.status === 'ok',
        })),
        defaultProvider: providerManager.getDefault()?.id || null,
        autoRoute: true,
        routes: Array.from(routeRegistry).sort(),
        dependencies,
      });
    }),
  );
}
