import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerProjectRoutes(app, projectManager) {
  app.post(
    '/api/v1/projects',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { name, rootPath, techStack = 'unknown' } = req.body;
      const userId = req.user?.id;

      if (!name || !rootPath) {
        throw new AppError('name and rootPath are required', 400);
      }

      try {
        const result = await projectManager.addProject(userId, name, rootPath, techStack);
        res.status(201).json(result);
      } catch (err) {
        throw new AppError(err.message || 'Failed to add project', 500);
      }
    }),
  );

  app.get(
    '/api/v1/projects',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      const projects = await projectManager.listProjects(userId);
      res.json({ projects });
    }),
  );

  app.delete(
    '/api/v1/projects/:id',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      try {
        await projectManager.removeProject(id);
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(err.message, 404);
        }
        throw new AppError(err.message || 'Failed to remove project', 500);
      }
      res.status(204).send();
    }),
  );
}
