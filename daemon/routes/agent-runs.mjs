import { asyncHandler, AppError, parsePagination, paginationMeta } from '../lib/route-utils.mjs';
import { authMiddleware, requestToken, verifyToken } from '../lib/auth.mjs';
import { prepare } from '../db/connection.mjs';
import { canStartRun, getActiveRunCount } from '../lib/run-limit.mjs';
import { normalizeSteps } from '../agent/orchestrator.mjs';
import { validateBody } from '../lib/validate.mjs';
import { AgentRunCreateSchema, AgentRunGenerateSchema } from '../lib/schemas.mjs';

export function registerAgentRunRoutes(app, orchestrator, log, jobQueue = null) {
  // Starting a run is the same three lines whichever route asks for it, and it
  // was about to be a third copy. The queue is preferred because a queued run
  // executes in a separate worker process; the inline path is a fallback for
  // callers that build the routes without one.
  const dispatch = (runId, userId) => {
    if (jobQueue) {
      jobQueue.enqueue(runId, { projectRoot: orchestrator.projectRoot, userId }).catch(async (err) => {
        log.error(`Job queue execution failed for ${runId}: ${err.message}`);
        await orchestrator.failRun(runId, userId, err);
      });
    } else {
      orchestrator.executeRun(runId, userId).catch(async (err) => {
        log.error(`Agent run execution failed: ${err.message}`);
        await orchestrator.failRun(runId, userId, err);
      });
    }
  };

  app.get(
    '/api/v1/agent-runs',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const { status, trigger } = req.query;
      const { page, limit, enabled } = parsePagination(req.query);
      const rawLimit = Number.parseInt(req.query.limit, 10);
      // Without `page`, keep the historical `?limit=` behaviour of an upper cap.
      let items = orchestrator.listRuns({
        status,
        trigger,
        limit: !enabled && Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : undefined,
        userId: req.user?.id,
      });
      const total = items.length;
      if (enabled) items = items.slice((page - 1) * limit, page * limit);
      res.json({
        runs: items.map((run) => ({
          ...run,
          queueStatus: jobQueue ? jobQueue.getStatus(run.id) : null,
        })),
        ...(enabled ? { pagination: paginationMeta(total, { page, limit }) } : {}),
      });
    }),
  );

  app.post(
    '/api/v1/agent-runs',
    authMiddleware(true),
    validateBody(AgentRunCreateSchema),
    asyncHandler(async (req, res) => {
      if (req.user?.id && !canStartRun(req.user.id)) {
        const count = getActiveRunCount(req.user.id);
        throw new AppError(`Max concurrent runs reached (${count}/5). Wait for active runs to complete.`, 429);
      }

      const { goal, steps, provider, model, trigger, metadata, draft } = req.body;
      if (!goal && !steps) throw new AppError('goal or steps is required', 400);
      let runSteps = steps;
      if (!runSteps) {
        runSteps = await orchestrator.generateSteps(goal, metadata || {});
      } else {
        runSteps = normalizeSteps(runSteps, []);
      }
      const run = await orchestrator.createRun({
        goal,
        steps: runSteps,
        provider,
        model,
        trigger: trigger || 'manual',
        metadata,
        userId: req.user?.id,
      });

      // Creating a run started nothing, so a POST followed by waiting produced
      // a run stuck in `created` indefinitely. It now starts, and `draft: true`
      // is the opt-out for callers that only want to persist a plan.
      let started = false;
      if (!draft) {
        dispatch(run.id, req.user?.id);
        started = true;
      }
      res.status(201).json({ run: started ? { ...run, status: 'running' } : run, started });
    }),
  );

  // SSE: EventSource cannot send an Authorization header, so the token is
  // accepted from ?token=<jwt> (verified against the header first). Rejecting
  // unauth'd streams closes an info leak: a caller could watch every run's
  // events without any credentials before.
  // Registered before GET /api/v1/agent-runs/:id — Express matches in
  // registration order, so the parameterised route would otherwise shadow it.
  app.get('/api/v1/agent-runs/events', (req, res) => {
    const token = requestToken(req);
    const payload = token ? verifyToken(token) : null;
    const user = payload
      ? prepare('SELECT id, email, name, role, tier FROM users WHERE id = ?').get(payload.sub)
      : null;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required', status: 401 });
    }
    req.user = user;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Node buffers headers until the first write; flush so the client gets the
    // 200 immediately even before any event fires.
    res.flushHeaders();

    const handler = (event, data) => {
      if (res.closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const eventTypes = [
      'run:created',
      'run:started',
      'run:completed',
      'run:updated',
      'run:step-start',
      'run:step-complete',
      'run:deleted',
    ];
    const listeners = eventTypes.map((evt) => {
      const fn = (data) => handler(evt, data);
      orchestrator.on(evt, fn);
      return [evt, fn];
    });

    // Also relay job queue events
    if (jobQueue) {
      jobQueue.on('job:queued', (data) => handler('run:queued', data));
      jobQueue.on('job:completed', (data) => handler('run:completed', data));
      jobQueue.on('job:failed', (data) => handler('run:failed', data));
    }

    req.on('close', () => {
      for (const [evt, fn] of listeners) {
        orchestrator.off(evt, fn);
      }
    });
  });

  app.get(
    '/api/v1/agent-runs/:id',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const run = orchestrator.getRun(req.params.id, req.user?.id);
      if (!run) throw new AppError('Run not found', 404);
      res.json({ run });
    }),
  );

  app.post(
    '/api/v1/agent-runs/:id/execute',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const run = orchestrator.getRun(req.params.id, req.user?.id);
      if (!run) throw new AppError('Run not found', 404);
      if (run.status === 'running' || run.status === 'queued') {
        throw new AppError(`Run is already ${run.status}`, 409);
      }

      dispatch(run.id, req.user?.id);
      res.json({ run: { ...run, status: 'running' } });
    }),
  );

  app.post(
    '/api/v1/agent-runs/:id/cancel',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const run = await orchestrator.cancelRun(req.params.id, req.user?.id);
      if (!run) throw new AppError('Run not found', 404);
      res.json({ run });
    }),
  );

  app.delete(
    '/api/v1/agent-runs/:id',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      await orchestrator.deleteRun(req.params.id, req.user?.id);
      res.json({ success: true });
    }),
  );

  app.post(
    '/api/v1/agent-runs/generate',
    authMiddleware(true),
    validateBody(AgentRunGenerateSchema),
    asyncHandler(async (req, res) => {
      const { goal, metadata } = req.body;
      if (!goal) throw new AppError('goal is required', 400);
      const steps = await orchestrator.generateSteps(goal, metadata || {});
      res.json({ steps });
    }),
  );

  app.post(
    '/api/v1/agent-runs/auto',
    authMiddleware(true),
    validateBody(AgentRunGenerateSchema),
    asyncHandler(async (req, res) => {
      const { goal, metadata } = req.body;
      if (!goal) throw new AppError('goal is required', 400);
      if (req.user?.id && !canStartRun(req.user.id)) {
        const count = getActiveRunCount(req.user.id);
        throw new AppError(`Max concurrent runs reached (${count}/5). Wait for active runs to complete.`, 429);
      }
      const run = await orchestrator.autoGenerateRun(goal, 'manual', {
        ...(metadata || {}),
        userId: req.user?.id,
      });

      dispatch(run.id, req.user?.id);

      res.status(201).json({ run: { ...run, status: 'running' }, started: true });
    }),
  );
}
