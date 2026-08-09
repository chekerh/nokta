import { asyncHandler, AppError } from '../lib/route-utils.mjs';

export function registerCodeActionRoutes(app, chatHandler) {
  async function runChat(messages, task) {
    const result = await chatHandler.handleChat(messages, {
      stream: false,
      task: task || 'code action',
    });
    return result;
  }

  app.post(
    '/api/v1/code-actions/explain',
    asyncHandler(async (req, res) => {
      const { code, language } = req.body;
      if (!code) throw new AppError('Code is required', 400);
      const result = await runChat(
        [{ role: 'user', content: `Explain this ${language || 'code'}:\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\`` }],
        'explain code',
      );
      res.json({ explanation: result.content });
    }),
  );

  app.post(
    '/api/v1/code-actions/refactor',
    asyncHandler(async (req, res) => {
      const { code, language, suggestion } = req.body;
      if (!code) throw new AppError('Code is required', 400);
      const prompt = `Refactor this ${language || 'code'}${suggestion ? ` with this goal: ${suggestion}` : ''}:\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``;
      const result = await runChat([{ role: 'user', content: prompt }], 'refactor code');
      res.json({ refactored: result.content });
    }),
  );

  app.post(
    '/api/v1/code-actions/generate-tests',
    asyncHandler(async (req, res) => {
      const { code, language, testFramework } = req.body;
      if (!code) throw new AppError('Code is required', 400);
      const prompt = `Generate ${testFramework || 'unit'} tests for this ${language || 'code'}:\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``;
      const result = await runChat([{ role: 'user', content: prompt }], 'generate tests');
      res.json({ tests: result.content });
    }),
  );

  app.post(
    '/api/v1/code-actions/fix-errors',
    asyncHandler(async (req, res) => {
      const { code, language, errors } = req.body;
      if (!code) throw new AppError('Code is required', 400);
      const errorContext = errors ? `\nErrors: ${JSON.stringify(errors)}` : '';
      const prompt = `Fix errors in this ${language || 'code'}:${errorContext}\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``;
      const result = await runChat([{ role: 'user', content: prompt }], 'fix errors');
      res.json({ fixed: result.content });
    }),
  );
}
