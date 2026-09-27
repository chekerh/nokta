import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { canStartRun, getActiveRunCount } from '../lib/run-limit.mjs';
import { loadAgentPacks, resolveAgentPack } from '../agent/agent-pack.mjs';

export function registerAgentRoutes(app, providerManager, _log, orchestrator = null, jobQueue = null) {
  app.get(
    '/api/v1/agents',
    asyncHandler(async (req, res) => {
      const realAgents = await loadAgentPacks();
      const providers = providerManager.list();
      const health = await providerManager.health();

      const providerAgents = providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.id,
        models: p.models,
        enabled: p.enabled,
        running: health[p.id]?.status === 'ok',
      }));

      const ollamaProvider = providerManager.get('ollama');
      const ollamaStatus = {
        running: health.ollama?.status === 'ok',
        error: health.ollama?.error,
        installedModels: ollamaProvider?.models || [],
      };

      res.json({
        agents: realAgents.length > 0 ? realAgents : providerAgents,
        fleet: realAgents,
        providers: providerAgents,
        ollamaStatus,
      });
    }),
  );

  app.post(
    '/api/v1/agents/recommend',
    asyncHandler(async (req, res) => {
      const { prompt } = req.body;
      if (!prompt) throw new AppError('Prompt is required', 400);

      const messages = [{ role: 'user', content: prompt }];
      const provider = await providerManager.selectProvider(messages);
      const complexity = provider?.classifyComplexity(messages) || 'low';

      const tierMap = { low: 1, medium: 2, high: 3 };
      res.json({
        complexity,
        taskType: complexity === 'high' ? 'architecture' : complexity === 'medium' ? 'implementation' : 'quick',
        recommendedTier: tierMap[complexity] || 1,
        recommendedAgent: provider?.id || null,
        reasoning: `Complexity: ${complexity}. Recommended provider: ${provider?.name || 'none'}`,
      });
    }),
  );

  app.get(
    '/api/v1/agents/:id',
    asyncHandler(async (req, res) => {
      const packs = await loadAgentPacks();
      const pack = resolveAgentPack(req.params.id, packs);
      if (!pack) throw new AppError(`Agent not found: ${req.params.id}`, 404);
      res.json({ agent: pack });
    }),
  );

  // Executes the selected agent pack. This is the route that was missing: the
  // catalog listed 267 agents and none of them could actually be run.
  app.post(
    '/api/v1/agents/:id/execute',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      if (!orchestrator) throw new AppError('Agent execution is not available', 503);
      const { goal } = req.body || {};
      if (!goal) throw new AppError('goal is required', 400);

      const packs = await loadAgentPacks();
      const pack = resolveAgentPack(req.params.id, packs);
      if (!pack) throw new AppError(`Agent not found: ${req.params.id}`, 404);

      const userId = req.user?.id;
      if (userId && !canStartRun(userId)) {
        throw new AppError(
          `Max concurrent runs reached (${getActiveRunCount(userId)}/5). Wait for active runs to complete.`,
          429,
        );
      }

      const run = await orchestrator.executeAgentPack({ pack, goal, userId });

      // Executed the same way as any other run: through the queue, so the
      // concurrency limit, cancellation and worker supervision all apply. The
      // deliverable is captured inside executeRun rather than here, because with
      // a queue the run finishes in a separate worker process that never sees
      // this closure.
      if (jobQueue) {
        jobQueue.enqueue(run.id, { projectRoot: orchestrator.projectRoot, userId }).catch(async (err) => {
          _log.error(`Agent pack execution failed for ${run.id}: ${err.message}`);
          await orchestrator.failRun(run.id, userId, err);
        });
      } else {
        orchestrator.executeRun(run.id, userId).catch(async (err) => {
          _log.error(`Agent pack execution failed for ${run.id}: ${err.message}`);
          await orchestrator.failRun(run.id, userId, err);
        });
      }

      res.status(201).json({
        run: { ...run, status: 'running' },
        agent: { id: pack.id, title: pack.title, role: pack.role },
      });
    }),
  );
}
