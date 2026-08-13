import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerBrainRoutes(app, userBrain) {
  app.get(
    '/api/v1/brain',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      try {
        const brain = await userBrain.getBrain(userId);
        res.json(brain);
      } catch (err) {
        throw new AppError(err.message || 'Failed to load brain', 500);
      }
    }),
  );

  app.patch(
    '/api/v1/brain/dna',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;

      const { dna } = req.body;
      if (!Array.isArray(dna)) {
        throw new AppError('dna must be an array of strings', 400);
      }

      try {
        await userBrain.updateDNA(userId, dna);
        res.json({ success: true });
      } catch (err) {
        throw new AppError(err.message || 'Failed to update DNA', 500);
      }
    }),
  );

  app.post(
    '/api/v1/brain/patterns',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;

      const { rule, example } = req.body;
      if (!rule || !example) {
        throw new AppError('rule and example are required', 400);
      }

      try {
        await userBrain.addLearnedPattern(userId, { rule, example });
        res.status(201).json({ success: true });
      } catch (err) {
        throw new AppError(err.message || 'Failed to add learned pattern', 500);
      }
    }),
  );

  app.get(
    '/api/v1/brain/context',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;

      try {
        const context = await userBrain.compileGlobalContext(userId);
        res.json({ context });
      } catch (err) {
        throw new AppError(err.message || 'Failed to compile context', 500);
      }
    }),
  );
}
