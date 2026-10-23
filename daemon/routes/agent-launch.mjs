import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { validateBody } from '../lib/validate.mjs';
import { launchAgent, launchAgentWithTrail, getAvailableAdapters } from '../lib/agent-launcher.mjs';

export function registerAgentLaunchRoutes(app, _projectManager, orchestrator) {
  // Launch an agent for a project
  app.post(
    '/api/v1/agent-launch',
    authMiddleware(true),
    validateBody({
      type: 'object',
      required: ['projectRoot', 'goal'],
      properties: {
        projectRoot: { type: 'string' },
        goal: { type: 'string' },
        adapter: { type: 'string' },
        model: { type: 'string' },
        options: { type: 'object' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { projectRoot, goal, adapter, model, options = {} } = req.body;
      const _userId = req.user?.id;

      if (!projectRoot || !goal) {
        throw new AppError('projectRoot and goal are required', 400);
      }

      try {
        const runInfo = await launchAgent({
          projectRoot,
          goal,
          adapter,
          model,
          options: { ...options, linkedLinearId: options?.linkedLinearId },
        });

        // Register this run in the orchestrator so SSE events are streamed
        if (orchestrator) {
          const runConfig = {
            id: runInfo.runId,
            projectRoot,
            goal,
            adapter: runInfo.adapter || 'opencode',
            model: runInfo.model || undefined,
            status: 'running',
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            steps: [],
            metadata: { linkedLinearId: runInfo.linkedLinearId },
          };
          orchestrator.emit('run:created', runConfig);
        }

        res.status(201).json({
          success: true,
          run: runInfo,
        });
      } catch (err) {
        throw new AppError(err.message || 'Failed to launch agent', 500);
      }
    }),
  );

  // Launch agent with trail integration
  app.post(
    '/api/v1/agent-launch/trail',
    authMiddleware(true),
    validateBody({
      type: 'object',
      required: ['projectRoot', 'goal'],
      properties: {
        projectRoot: { type: 'string' },
        goal: { type: 'string' },
        adapter: { type: 'string' },
        model: { type: 'string' },
        options: { type: 'object' },
        trailData: { type: 'object' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { projectRoot, goal, adapter, model, options = {}, trailData = {} } = req.body;
      const _userId = req.user?.id;

      if (!projectRoot || !goal) {
        throw new AppError('projectRoot and goal are required', 400);
      }

      try {
        const runInfo = await launchAgentWithTrail({
          projectRoot,
          goal,
          adapter,
          model,
          options: { ...options, linkedLinearId: options?.linkedLinearId },
          trailData,
        });

        // Register this run in the orchestrator so SSE events are streamed
        if (orchestrator) {
          const runConfig = {
            id: runInfo.runId,
            projectRoot,
            goal,
            adapter: runInfo.adapter || 'opencode',
            model: runInfo.model || undefined,
            status: 'running',
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            steps: [],
            metadata: { linkedLinearId: runInfo.linkedLinearId },
          };
          orchestrator.emit('run:created', runConfig);
        }

        res.status(201).json({
          success: true,
          run: runInfo,
        });
      } catch (err) {
        throw new AppError(err.message || 'Failed to launch agent with trail', 500);
      }
    }),
  );

  // Get available adapters for a project
  app.get(
    '/api/v1/agent-launch/adapters/:projectRoot',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      const { projectRoot } = req.params;
      const _userId = req.user?.id;

      if (!projectRoot) {
        throw new AppError('projectRoot is required', 400);
      }

      try {
        const adapters = await getAvailableAdapters(projectRoot);
        res.json({ adapters });
      } catch (err) {
        throw new AppError(err.message || 'Failed to get available adapters', 500);
      }
    }),
  );
}
