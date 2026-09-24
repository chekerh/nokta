import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(__dirname, '..', '..', 'agents');

async function loadAgentPacks() {
  try {
    const files = await fs.readdir(AGENTS_DIR);
    const agentFiles = files.filter((f) => f.endsWith('.agent.json'));
    const list = [];
    for (const file of agentFiles) {
      try {
        const raw = await fs.readFile(path.join(AGENTS_DIR, file), 'utf8');
        list.push(JSON.parse(raw));
      } catch {}
    }
    return list;
  } catch {
    return [];
  }
}

export function registerAgentRoutes(app, providerManager, _log) {
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
}
