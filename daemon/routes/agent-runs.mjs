import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { canStartRun, getActiveRunCount } from '../lib/run-limit.mjs';

export function registerAgentRunRoutes(app, orchestrator, log, jobQueue = null) {
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
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      if (req.user?.id && !canStartRun(req.user.id)) {
        const count = getActiveRunCount(req.user.id);
        throw new AppError(`Max concurrent runs reached (${count}/5). Wait for active runs to complete.`, 429);
      }

      const { goal, steps, provider, model, trigger, metadata } = req.body;
      if (!goal && !steps) throw new AppError('goal or steps is required', 400);
      let runSteps = steps;
      if (!runSteps) {
        runSteps = await orchestrator.generateSteps(goal, metadata || {});
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
      res.status(201).json({ run });
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
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const run = orchestrator.getRun(req.params.id, req.user?.id);
      if (!run) throw new AppError('Run not found', 404);

      await orchestrator.updateRun(run.id, { status: 'running' });

      if (jobQueue) {
        jobQueue
          .enqueue(run.id, {
            projectRoot: orchestrator.projectRoot,
            userId: req.user?.id,
          })
          .catch((err) => {
            log.error(`Job queue execution failed for ${run.id}: ${err.message}`);
          });
        res.json({ run: { ...run, status: 'running' } });
      } else {
        // Fall back to inline execution
        orchestrator.executeRun(run.id).catch((err) => {
          log.error(`Agent run execution failed: ${err.message}`);
        });
        res.json({ run: { ...run, status: 'running' } });
      }
    }),
  );

  app.post(
    '/api/v1/agent-runs/:id/cancel',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      const run = await orchestrator.cancelRun(req.params.id, req.user?.id);
      if (!run) throw new AppError('Run not found', 404);
      res.json({ run });
    }),
  );

  app.delete(
    '/api/v1/agent-runs/:id',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      await orchestrator.load();
      await orchestrator.deleteRun(req.params.id, req.user?.id);
      res.json({ success: true });
    }),
  );

  app.post(
    '/api/v1/agent-runs/generate',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { goal, metadata } = req.body;
      if (!goal) throw new AppError('goal is required', 400);
      const steps = await orchestrator.generateSteps(goal, metadata || {});
      res.json({ steps });
    }),
  );

  app.post(
    '/api/v1/agent-runs/auto',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { goal, metadata } = req.body;
      if (!goal) throw new AppError('goal is required', 400);
      const run = await orchestrator.autoGenerateRun(goal, 'manual', {
        ...(metadata || {}),
        userId: req.user?.id,
      });

      if (jobQueue) {
        jobQueue
          .enqueue(run.id, {
            projectRoot: orchestrator.projectRoot,
            userId: req.user?.id,
          })
          .catch((err) => {
            log.error(`Job queue auto-run failed for ${run.id}: ${err.message}`);
          });
      } else {
        orchestrator.executeRun(run.id).catch((err) => {
          log.error(`Auto agent run failed: ${err.message}`);
        });
      }

      res.status(201).json({ run });
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
