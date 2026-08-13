import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { synthesizeSkills, getSkills, rankSkills } from '../lib/skill-synthesizer.mjs';

export function registerSkillEvolutionRoutes(app, projectRoot) {
  app.post(
    '/api/v1/skills/synthesize',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { sources } = req.body;

      try {
        const result = await synthesizeSkills(projectRoot, sources || {});
        res.json(result);
      } catch (err) {
        throw new AppError(err.message || 'Skill synthesis failed', 500);
      }
    }),
  );

  app.get(
    '/api/v1/skills/learned',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const result = await getSkills(projectRoot);
      res.json(result);
    }),
  );

  app.get(
    '/api/v1/skills/ranked',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { feedback } = req.query;
      let feedbackData = {};
      if (feedback) {
        try {
          feedbackData = JSON.parse(feedback);
        } catch {
          throw new AppError('Invalid feedback query parameter', 400);
        }
      }

      const ranked = await rankSkills(projectRoot, feedbackData);
      res.json({ skills: ranked, total: ranked.length });
    }),
  );
}
