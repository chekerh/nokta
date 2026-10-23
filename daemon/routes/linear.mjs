import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';
import { validateBody } from '../lib/validate.mjs';
import {
  getLinearIssue,
  commentOnLinearIssue,
  updateLinearIssueState,
  getLinearStates,
  registerLinearWebhook,
  syncRunToLinear,
  createLinearWebhookHandler,
} from '../lib/linear-integration.mjs';

export function registerLinearRoutes(app, projectManager, orchestrator, log) {
  // Webhook endpoint (no auth required - uses signature verification)
  app.post(
    '/api/v1/linear/webhook',
    asyncHandler(async (req, res) => {
      const handler = createLinearWebhookHandler({ projectManager, orchestrator, log });
      await handler(req, res);
    }),
  );

  // All other Linear routes require auth
  const linearAuth = authMiddleware(true);

  // Get Linear issue details
  app.get(
    '/api/v1/linear/issue/:issueId',
    linearAuth,
    validateBody({
      type: 'object',
      properties: {
        apiKey: { type: 'string' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { issueId } = req.params;
      const { apiKey } = req.query;

      if (!apiKey) {
        throw new AppError('Linear API key required (pass as ?apiKey=...)', 400);
      }

      try {
        const issue = await getLinearIssue(apiKey, issueId);
        res.json({ issue });
      } catch (err) {
        throw new AppError(err.message || 'Failed to fetch Linear issue', 500);
      }
    }),
  );

  // Comment on Linear issue
  app.post(
    '/api/v1/linear/issue/:issueId/comment',
    linearAuth,
    validateBody({
      type: 'object',
      required: ['apiKey', 'body'],
      properties: {
        apiKey: { type: 'string' },
        body: { type: 'string' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { issueId } = req.params;
      const { apiKey, body } = req.body;

      if (!apiKey || !body) {
        throw new AppError('apiKey and body are required', 400);
      }

      try {
        const comment = await commentOnLinearIssue(apiKey, issueId, body);
        res.json({ comment });
      } catch (err) {
        throw new AppError(err.message || 'Failed to comment on Linear issue', 500);
      }
    }),
  );

  // Update Linear issue state
  app.post(
    '/api/v1/linear/issue/:issueId/state',
    linearAuth,
    validateBody({
      type: 'object',
      required: ['apiKey', 'stateId'],
      properties: {
        apiKey: { type: 'string' },
        stateId: { type: 'string' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { issueId } = req.params;
      const { apiKey, stateId } = req.body;

      if (!apiKey || !stateId) {
        throw new AppError('apiKey and stateId are required', 400);
      }

      try {
        const result = await updateLinearIssueState(apiKey, issueId, stateId);
        res.json({ issue: result.issue });
      } catch (err) {
        throw new AppError(err.message || 'Failed to update Linear issue state', 500);
      }
    }),
  );

  // Get Linear states for a team
  app.get(
    '/api/v1/linear/team/:teamId/states',
    linearAuth,
    asyncHandler(async (req, res) => {
      const { teamId } = req.params;
      const { apiKey } = req.query;

      if (!apiKey) {
        throw new AppError('Linear API key required (pass as ?apiKey=...)', 400);
      }

      try {
        const data = await getLinearStates(apiKey, teamId);
        res.json({ states: data.team?.states?.nodes || [] });
      } catch (err) {
        throw new AppError(err.message || 'Failed to fetch Linear states', 500);
      }
    }),
  );

  // Register Linear webhook
  app.post(
    '/api/v1/linear/webhook/register',
    linearAuth,
    validateBody({
      type: 'object',
      required: ['apiKey', 'webhookUrl', 'teamId'],
      properties: {
        apiKey: { type: 'string' },
        webhookUrl: { type: 'string', format: 'uri' },
        teamId: { type: 'string' },
      },
    }),
    asyncHandler(async (req, res) => {
      const { apiKey, webhookUrl, teamId } = req.body;

      try {
        const webhook = await registerLinearWebhook(apiKey, webhookUrl, teamId);
        res.json({ webhook });
      } catch (err) {
        throw new AppError(err.message || 'Failed to register Linear webhook', 500);
      }
    }),
  );

  // Sync agent run to Linear (called by orchestrator on status changes)
  app.post(
    '/api/v1/linear/sync-run',
    linearAuth,
    validateBody({
      type: 'object',
      required: ['apiKey', 'issueId', 'runInfo', 'status'],
      properties: {
        apiKey: { type: 'string' },
        issueId: { type: 'string' },
        runInfo: { type: 'object' },
        status: { type: 'string', enum: ['running', 'completed', 'failed', 'cancelled'] },
      },
    }),
    asyncHandler(async (req, res) => {
      const { apiKey, issueId, runInfo, status } = req.body;

      try {
        const comment = await syncRunToLinear(apiKey, issueId, runInfo, status);
        res.json({ comment });
      } catch (err) {
        throw new AppError(err.message || 'Failed to sync run to Linear', 500);
      }
    }),
  );

  // Link project to Linear team/project
  app.post(
    '/api/v1/projects/:projectRoot/linear-link',
    linearAuth,
    validateBody({
      type: 'object',
      required: ['linearId', 'linearType'],
      properties: {
        linearId: { type: 'string' },
        linearType: { type: 'string', enum: ['team', 'project'] },
      },
    }),
    asyncHandler(async (req, res) => {
      const { projectRoot } = req.params;
      const { linearId, linearType } = req.body;

      try {
        // Update project registry with Linear link
        await projectManager.updateProjectRegistry(
          projectRoot,
          '', // adapter (keep existing)
          [], // preferredModels (keep existing)
          [], // stackSignals (keep existing)
          '', // trailPath (keep existing)
          linearId,
        );

        res.json({ success: true, projectRoot, linearId, linearType });
      } catch (err) {
        throw new AppError(err.message || 'Failed to link project to Linear', 500);
      }
    }),
  );
}
