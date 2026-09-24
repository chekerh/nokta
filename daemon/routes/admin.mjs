import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { prepare } from '../db/connection.mjs';
import { authMiddleware, requireRole } from '../lib/auth.mjs';

export function registerAdminRoutes(app) {
  // All admin endpoints require authentication and admin role
  const adminGuard = [authMiddleware(true), requireRole('admin')];

  // List all users
  app.get(
    '/api/v1/admin/users',
    ...adminGuard,
    asyncHandler(async (req, res) => {
      const users = prepare(
        'SELECT id, email, name, role, tier, monthly_cost_limit, daily_token_limit, created_at, updated_at FROM users ORDER BY created_at DESC',
      ).all();
      res.json({ users });
    }),
  );

  // Update user role
  app.patch(
    '/api/v1/admin/users/:id/role',
    ...adminGuard,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      if (!['admin', 'user'].includes(role)) {
        throw new AppError('Invalid role. Must be "admin" or "user"', 400);
      }

      if (id === req.user.id && role !== 'admin') {
        throw new AppError('Cannot demote your own admin account', 400);
      }

      const existing = prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!existing) {
        throw new AppError('User not found', 404);
      }

      prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, id);
      const updated = prepare('SELECT id, email, name, role, tier FROM users WHERE id = ?').get(id);
      res.json({ success: true, user: updated });
    }),
  );

  // Update user tier
  app.patch(
    '/api/v1/admin/users/:id/tier',
    ...adminGuard,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { tier } = req.body;

      if (!['free', 'pro', 'enterprise'].includes(tier)) {
        throw new AppError('Invalid tier. Must be "free", "pro", or "enterprise"', 400);
      }

      const existing = prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!existing) {
        throw new AppError('User not found', 404);
      }

      prepare("UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?").run(tier, id);
      const updated = prepare('SELECT id, email, name, role, tier FROM users WHERE id = ?').get(id);
      res.json({ success: true, user: updated });
    }),
  );

  // System and operational metrics
  app.get(
    '/api/v1/admin/metrics',
    ...adminGuard,
    asyncHandler(async (req, res) => {
      const userCount = prepare('SELECT count(*) as total FROM users').get()?.total || 0;
      const tierCounts = prepare('SELECT tier, count(*) as count FROM users GROUP BY tier').all();
      const roleCounts = prepare('SELECT role, count(*) as count FROM users GROUP BY role').all();
      const projectCount = prepare('SELECT count(*) as total FROM projects').get()?.total || 0;
      const runCount = prepare('SELECT count(*) as total FROM agent_runs').get()?.total || 0;
      const runsByStatus = prepare('SELECT status, count(*) as count FROM agent_runs GROUP BY status').all();
      const costStats = prepare(
        'SELECT count(*) as entries, COALESCE(sum(cost), 0) as totalCost, COALESCE(sum(tokens_in + tokens_out), 0) as totalTokens FROM cost_logs',
      ).get() || { entries: 0, totalCost: 0, totalTokens: 0 };

      res.json({
        metrics: {
          users: {
            total: userCount,
            byTier: Object.fromEntries(tierCounts.map((t) => [t.tier, t.count])),
            byRole: Object.fromEntries(roleCounts.map((r) => [r.role, r.count])),
          },
          projects: {
            total: projectCount,
          },
          agentRuns: {
            total: runCount,
            byStatus: Object.fromEntries(runsByStatus.map((s) => [s.status, s.count])),
          },
          costs: {
            logEntries: costStats.entries,
            totalCost: costStats.totalCost,
            totalTokens: costStats.totalTokens,
          },
        },
      });
    }),
  );
}
