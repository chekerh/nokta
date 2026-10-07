import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { discoverAgents } from '../lib/fleet.mjs';

export function registerFleetRoutes(app, fleet) {
  app.get(
    '/api/v1/fleet',
    authMiddleware(),
    asyncHandler(async (_req, res) => {
      const sessions = await fleet.list();
      res.json({ sessions, runningAgents: discoverAgents() });
    }),
  );

  app.post(
    '/api/v1/fleet',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { project, provider = 'opencode', pid, port, cwd } = req.body || {};
      if (!project) throw new AppError('project is required', 400);
      if (!['opencode', 'freebuff'].includes(provider)) {
        throw new AppError('provider must be opencode or freebuff', 400);
      }
      const session = await fleet.register({ project, provider, pid, port, cwd });
      res.status(201).json(session);
    }),
  );

  app.delete(
    '/api/v1/fleet/:project',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const provider = req.query.provider;
      const removed = await fleet.forget(req.params.project, provider);
      res.json({ removed });
    }),
  );

  app.post(
    '/api/v1/fleet/:project/run',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { prompt, provider = 'opencode', timeoutMs } = req.body || {};
      if (!prompt || typeof prompt !== 'string') throw new AppError('prompt is required', 400);
      try {
        const result = await fleet.run(req.params.project, prompt, {
          provider,
          timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
        });
        res.json(result);
      } catch (err) {
        if (err.code === 'E_NO_HEADLESS') throw new AppError(err.message, 501);
        throw err;
      }
    }),
  );
}
