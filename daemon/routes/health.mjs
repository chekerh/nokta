import * as path from 'node:path';
import { asyncHandler } from '../lib/route-utils.mjs';
import { checkAll } from '../lib/health.mjs';
import { getDbPath } from '../db/connection.mjs';

const routeRegistry = new Set();

export function trackRoute(name) {
  routeRegistry.add(name);
}

// The provider health() sweep fires per-provider network probes, so LB polling
// and /health bursts must not stampede the upstreams. Cache the sweep for a few
// seconds per ProviderManager instance and bound it with a hard timeout; a
// wedged provider can never hang the endpoint.
const SWEEP_TTL_MS = 5000;
const SWEEP_TIMEOUT_MS = 8000;
const sweepCaches = new WeakMap();

function sweepProviderHealth(providerManager) {
  let cache = sweepCaches.get(providerManager);
  if (!cache) {
    cache = { promise: null, at: 0 };
    sweepCaches.set(providerManager, cache);
  }
  if (cache.promise && Date.now() - cache.at < SWEEP_TTL_MS) return cache.promise;
  cache.at = Date.now();
  const timeout = new Promise((resolve) => {
    const t = setTimeout(
      () => resolve({ ok: false, error: `provider health sweep timed out after ${SWEEP_TIMEOUT_MS / 1000}s` }),
      SWEEP_TIMEOUT_MS,
    );
    t.unref?.();
  });
  const probe = providerManager.health().then(
    (health) => ({ ok: true, health }),
    (err) => ({ ok: false, error: err.message }),
  );
  cache.promise = Promise.race([probe, timeout]);
  return cache.promise;
}

const DATA_DIR = path.dirname(getDbPath());

export function registerHealthRoute(app, providerManager) {
  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const sweep = await sweepProviderHealth(providerManager);
      const providers = providerManager.list();
      const dependencies = await checkAll({
        providerManager,
        providerHealth: sweep.ok ? sweep.health : null,
        dataDir: DATA_DIR,
      });
      // Top-level status tracks process readiness (db + disk): a provider being
      // down keeps the instance ready so LBs fail over per-request, while a
      // failed db or disk probe is a real readiness failure.
      let status = 'ok';
      if (dependencies.database.status === 'error' || dependencies.disk.status === 'error') status = 'error';
      else if (dependencies.database.status !== 'ok' || dependencies.disk.status !== 'ok') status = 'degraded';
      res.json({
        status,
        version: '0.3.0',
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          healthy: sweep.ok && sweep.health[p.id]?.status === 'ok',
        })),
        defaultProvider: providerManager.getDefault()?.id || null,
        autoRoute: true,
        routes: Array.from(routeRegistry).sort(),
        dependencies,
      });
    }),
  );
}
