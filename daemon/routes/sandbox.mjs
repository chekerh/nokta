import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { SandboxManager } from '../lib/sandbox.mjs';
import path from 'node:path';

export function registerSandboxRoutes(app, log) {
  const sandbox = new SandboxManager({ log });

  app.post(
    '/api/v1/sandbox/exec',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { code, fileName, timeoutMs, memoryLimit } = req.body;

      if (!code) {
        throw new AppError('code is required', 400);
      }

      const result = await sandbox.exec(code, {
        fileName: fileName || 'exec.mjs',
        timeoutMs: timeoutMs || 30000,
        memoryLimit,
      });

      res.json(result.toJSON());
    }),
  );

  app.post(
    '/api/v1/sandbox/exec-file',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { file, target, timeoutMs, memoryLimit } = req.body;

      if (!file) {
        throw new AppError('file is required', 400);
      }

      const targetDir = target || process.cwd();
      const fullPath = path.resolve(targetDir, file);
      const projectRoot = process.cwd();
      if (!fullPath.startsWith(path.resolve(projectRoot))) {
        throw new AppError('Path traversal detected', 403);
      }
      const result = await sandbox.execFile(fullPath, {
        timeoutMs: timeoutMs || 30000,
        memoryLimit,
      });

      res.json(result.toJSON());
    }),
  );
}
