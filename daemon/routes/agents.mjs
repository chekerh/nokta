import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerAgentRoutes(app, providerManager, _log) {
  app.get(
    '/api/v1/agents',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const providers = providerManager.list();
      const health = await providerManager.health();

      const agents = providers.map((p) => ({
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

      res.json({ agents, ollamaStatus });
    }),
  );

  app.post(
    '/api/v1/agents/recommend',
    authMiddleware(),
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
}
