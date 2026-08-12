import { authMiddleware } from '../lib/auth.mjs';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

export function registerCompleteRoutes(app, providerManager) {
  app.post(
    '/api/v1/chat/complete',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { prompt, context = [], model, maxTokens, temperature } = req.body;

      if (!prompt) throw new AppError('Prompt is required', 400);

      const provider = await providerManager.selectProvider([{ role: 'user', content: prompt }]);
      if (!provider) throw new AppError('No AI provider available', 503);

      const result = await provider.complete(prompt, { context, model, maxTokens, temperature });
      res.json(result);
    }),
  );
}
