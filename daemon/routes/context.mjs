import { asyncHandler } from '../lib/route-utils.mjs';
import { compileContext, detectProject, loadPacks } from '../../compiler/lib/nokta.mjs';

export function registerContextRoutes(app) {
  app.post(
    '/api/v1/context',
    asyncHandler(async (req, res) => {
      const { target, task, adapter = 'codex', budget = 6000 } = req.body;
      const result = compileContext({
        target: target || process.cwd(),
        task: task || 'general software engineering task',
        adapter,
        budget: String(budget),
      });
      res.json({
        metadata: result.metadata,
        markdown: result.markdown,
      });
    }),
  );

  app.post(
    '/api/v1/detect',
    asyncHandler(async (req, res) => {
      const { target } = req.body;
      const detected = detectProject(target || process.cwd());
      res.json(detected);
    }),
  );

  app.get(
    '/api/v1/packs',
    asyncHandler(async (req, res) => {
      const packs = loadPacks();
      res.json({
        packs: packs.map((p) => ({
          id: p.id,
          title: p.title,
          kind: p.kind,
          summary: p.summary,
          priority: p.priority,
          tokenCost: p.tokenCost,
          required: p.required,
          triggers: p.triggers,
        })),
      });
    }),
  );
}
