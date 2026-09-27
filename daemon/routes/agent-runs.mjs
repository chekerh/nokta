import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { canStartRun, getActiveRunCount } from '../lib/run-limit.mjs';
import { normalizeSteps } from '../agent/orchestrator.mjs';

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
      const { status, trigger, limit } = req.query;
      const runs = orchestrator
        .listRuns({
          status,
          trigger,
          limit: limit ? parseInt(limit, 10) : undefined,
          userId: req.user?.id,
        })
        .map((run) => ({
          ...run,
          queueStatus: jobQueue ? jobQueue.getStatus(run.id) : null,
        }));
      res.json({ runs });
    }),
  );

  app.post(
    '/api/v1/agent-runs',
    authMiddleware(true),
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

  app.get('/api/v1/agent-runs/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

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
}
