import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

export function registerDecisionRoutes(app, decisionEngine) {
  const DECISION_TYPES = ['architectural', 'ui-ux', 'technology', 'process', 'security'];
  const DECISION_STATUSES = ['proposed', 'under-review', 'accepted', 'superseded', 'rejected'];

  app.get(
    '/api/v1/decisions',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { type, status, tag, since, sortBy } = req.query;
      const opts = {};
      if (type) opts.type = type;
      if (status) {
        if (!DECISION_STATUSES.includes(status)) {
          throw new AppError(`Invalid status: ${status}. Must be one of: ${DECISION_STATUSES.join(', ')}`, 400);
        }
        opts.status = status;
      }
      if (tag) opts.tag = tag;
      if (since) opts.since = since;
      if (sortBy) opts.sortBy = sortBy;

      const decisions = await decisionEngine.listDecisions(opts);
      res.json({ decisions, total: decisions.length });
    }),
  );

  app.post(
    '/api/v1/decisions',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { type, title, description, rationale, alternativesConsidered, tags, relatedItems } = req.body;

      if (!type) throw new AppError('Decision type is required', 400);
      if (!DECISION_TYPES.includes(type)) {
        throw new AppError(`Invalid decision type: ${type}. Must be one of: ${DECISION_TYPES.join(', ')}`, 400);
      }

      if (!title || !title.trim()) throw new AppError('Decision title is required', 400);

      const decision = await decisionEngine.createDecision({
        type,
        title: title.trim(),
        description: description || '',
        rationale: rationale || '',
        alternativesConsidered: Array.isArray(alternativesConsidered) ? alternativesConsidered : [],
        tags: Array.isArray(tags) ? tags : [],
        relatedItems: Array.isArray(relatedItems) ? relatedItems : [],
      });

      res.status(201).json(decision);
    }),
  );

  app.get(
    '/api/v1/decisions/:id',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!id) throw new AppError('Decision ID is required', 400);

      try {
        const decision = await decisionEngine.getDecision(id);
        res.json(decision);
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(`Decision not found: ${id}`, 404);
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/v1/decisions/:id',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!id) throw new AppError('Decision ID is required', 400);

      const updates = {};
      const allowedFields = [
        'title',
        'description',
        'rationale',
        'alternativesConsidered',
        'status',
        'decisionDate',
        'reviewedBy',
        'effectiveDate',
        'supersededBy',
        'supersedes',
        'tags',
        'relatedFiles',
        'relatedItems',
        'implementedIn',
        'impactAssessment',
      ];

      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          if (key === 'status' && !DECISION_STATUSES.includes(req.body[key])) {
            throw new AppError(
              `Invalid status: ${req.body[key]}. Must be one of: ${DECISION_STATUSES.join(', ')}`,
              400,
            );
          }
          if (key === 'type' && !DECISION_TYPES.includes(req.body[key])) {
            throw new AppError(`Invalid type: ${req.body[key]}. Must be one of: ${DECISION_TYPES.join(', ')}`, 400);
          }
          updates[key] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new AppError('No valid fields to update provided', 400);
      }

      try {
        const decision = await decisionEngine.updateDecision(id, updates);
        res.json(decision);
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(`Decision not found: ${id}`, 404);
        }
        throw err;
      }
    }),
  );

  app.delete(
    '/api/v1/decisions/:id',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!id) throw new AppError('Decision ID is required', 400);

      try {
        const result = await decisionEngine.deleteDecision(id);
        res.json(result);
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(`Decision not found: ${id}`, 404);
        }
        throw err;
      }
    }),
  );

  // --- Decision Analysis and Insights ---
  app.get(
    '/api/v1/decisions/:id/impact',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!id) throw new AppError('Decision ID is required', 400);

      try {
        const impact = await decisionEngine.getDecisionImpactAnalysis(id);
        res.json(impact);
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(`Decision not found: ${id}`, 404);
        }
        throw err;
      }
    }),
  );

  app.get(
    '/api/v1/decisions/:id/related',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { relationship } = req.query;
      if (!id) throw new AppError('Decision ID is required', 400);

      try {
        const related = await decisionEngine.findRelatedDecisions(id, { relationship });
        res.json({ related, count: related.length });
      } catch (err) {
        if (err.message.includes('not found')) {
          throw new AppError(`Decision not found: ${id}`, 404);
        }
        throw err;
      }
    }),
  );

  // --- Decision Templates ---
  app.get(
    '/api/v1/decisions/templates/:type',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      if (!type) throw new AppError('Decision type is required', 400);

      try {
        // Validate type
        if (!DECISION_TYPES.includes(type)) {
          throw new AppError(`Invalid decision type: ${type}. Must be one of: ${DECISION_TYPES.join(', ')}`, 400);
        }

        const template = decisionEngine.getDecisionTemplate(type);
        res.json({ template, type });
      } catch (err) {
        if (err.message.includes('invalid')) {
          throw new AppError(err.message, 400);
        }
        throw err;
      }
    }),
  );

  app.get(
    '/api/v1/decisions/templates',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const templates = {};
      for (const type of DECISION_TYPES) {
        templates[type] = decisionEngine.getDecisionTemplate(type);
      }
      res.json({ templates });
    }),
  );

  // --- Decision Analytics ---
  app.get(
    '/api/v1/decisions/analytics/summary',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const decisions = await decisionEngine.listDecisions();

      // Group by type
      const byType = {};
      DECISION_TYPES.forEach((t) => {
        byType[t] = decisions.filter((d) => d.type === t).length;
      });

      // Group by status
      const byStatus = {};
      DECISION_STATUSES.forEach((s) => {
        byStatus[s] = decisions.filter((d) => d.status === s).length;
      });

      // Recent decisions (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recent = decisions.filter((d) => new Date(d.createdAt) >= thirtyDaysAgo);

      // Implementation rate
      const implemented = decisions.filter((d) => !!d.implementedIn).length;

      // Calculate average decision age
      let totalAgeDays = 0;
      let validDates = 0;
      for (const d of decisions) {
        if (d.createdAt) {
          const ageMs = Date.now() - new Date(d.createdAt).getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          totalAgeDays += ageDays;
          validDates++;
        }
      }
      const avgDecisionAge = validDates > 0 ? totalAgeDays / validDates : 0;

      res.json({
        total: decisions.length,
        byType,
        byStatus,
        recentCount: recent.length,
        implementationRate: decisions.length > 0 ? (implemented / decisions.length) * 100 : 0,
        avgDecisionAge: Number(avgDecisionAge.toFixed(1)),
      });
    }),
  );

  // --- Bulk Operations ---
  app.post(
    '/api/v1/decisions/bulk-update-status',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { decisionIds, status } = req.body;

      if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
        throw new AppError('decisionIds array is required', 400);
      }

      if (!status || !DECISION_STATUSES.includes(status)) {
        throw new AppError(`Valid status is required. Must be one of: ${DECISION_STATUSES.join(', ')}`, 400);
      }

      const results = {
        successful: [],
        failed: [],
        total: decisionIds.length,
      };

      for (const id of decisionIds) {
        try {
          await decisionEngine.updateDecision(id, { status });
          results.successful.push({ id, status: 'updated' });
        } catch (err) {
          results.failed.push({ id, error: err.message });
        }
      }

      res.json(results);
    }),
  );
}
