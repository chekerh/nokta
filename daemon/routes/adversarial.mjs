import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { CriticAgent } from '../lib/critic-agent.mjs';

function safePath(base, targetPath) {
  const resolved = path.resolve(base, targetPath);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new AppError('Path traversal detected', 403);
  }
  return resolved;
}

export function registerAdversarialRoutes(app, chatHandler, log) {
  const critic = new CriticAgent({ chatHandler, log });

  app.post(
    '/api/v1/adversarial/review',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { code, file, target, provider, model, maxRounds } = req.body;
      const filePath = file || 'unknown';

      if (!code && !file) {
        throw new AppError('Either "code" or "file" + "target" is required', 400);
      }

      let codeToReview = code;
      if (!codeToReview && file) {
        const targetDir = target || process.cwd();
        try {
          codeToReview = fs.readFileSync(safePath(targetDir, filePath), 'utf8');
        } catch {
          throw new AppError(`Cannot read file: ${filePath}`, 404);
        }
      }

      try {
        const result = await critic.adversarialReview(codeToReview, {
          file: filePath,
          provider,
          model,
          maxRounds: maxRounds || 2,
        });
        res.json(result);
      } catch (err) {
        throw new AppError(err.message || 'Adversarial review failed', 500);
      }
    }),
  );

  app.post(
    '/api/v1/adversarial/critique',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { code, file, target, provider, model } = req.body;
      const filePath = file || 'unknown';

      if (!code && !file) {
        throw new AppError('Either "code" or "file" + "target" is required', 400);
      }

      let codeToReview = code;
      if (!codeToReview && file) {
        const targetDir = target || process.cwd();
        try {
          codeToReview = fs.readFileSync(safePath(targetDir, file), 'utf8');
        } catch {
          throw new AppError(`Cannot read file: ${file}`, 404);
        }
      }

      const critique = await critic.critique(codeToReview, { file: filePath, provider, model });
      res.json(critique);
    }),
  );
}
