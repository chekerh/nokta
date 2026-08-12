import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { sendSSEError, streamOllama, streamOpenAI, streamClaude } from '../lib/streaming-utils.mjs';

export function registerChatRoutes(app, chatHandler, providerManager) {
  app.post(
    '/api/v1/chat',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const {
        messages,
        stream = false,
        task,
        conciseness,
        provider: explicitProvider,
        model: explicitModel,
      } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new AppError('Messages array is required', 400);
      }

      const opts = { stream, task, conciseness, provider: explicitProvider, model: explicitModel };

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        try {
          const chatResult = await chatHandler.handleChat(messages, { ...opts, stream: true });
          const httpResponse = chatResult.response;
          const meta = { tokensIn: chatResult.tokensIn, provider: chatResult.provider, model: chatResult.model || '' };

          if (chatResult.provider === 'ollama') {
            streamOllama(httpResponse, res, undefined, meta);
          } else if (chatResult.provider === 'claude') {
            streamClaude(httpResponse, res, undefined, meta);
          } else {
            streamOpenAI(httpResponse, res, undefined, meta);
          }
        } catch (err) {
          sendSSEError(res, err.message);
        }
        return;
      }

      const result = await chatHandler.handleChat(messages, opts);
      res.json(result);
    }),
  );

  app.get(
    '/api/v1/models',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const providers = providerManager.list();
      const result = [];
      for (const p of providers) {
        const provider = providerManager.get(p.id);
        if (provider) {
          const models = await provider.listModels().catch(() => provider.models);
          result.push({ provider: p.id, models });
        }
      }
      res.json({ models: result });
    }),
  );
}
