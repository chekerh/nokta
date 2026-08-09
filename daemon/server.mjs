import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ProviderManager } from './lib/provider-manager.mjs';
import { ChatHandler } from './lib/chat-handler.mjs';
import { CostTracker } from './lib/cost-tracker.mjs';
import { GateKeeper } from './lib/gate-keeper.mjs';
import { logger } from './lib/logger.mjs';
import { migrate } from './db/schema.mjs';
import { registerAuthRoutes } from './routes/auth.mjs';
import { registerChatRoutes } from './routes/chat.mjs';
import { registerCompleteRoutes } from './routes/complete.mjs';
import { registerAgentRoutes } from './routes/agents.mjs';
import { registerProviderRoutes } from './routes/providers.mjs';
import { registerCostRoutes } from './routes/costs.mjs';
import { registerGateRoutes } from './routes/gates.mjs';
import { registerTrailRoutes } from './routes/trail.mjs';
import { registerSearchRoutes } from './routes/search.mjs';
import { registerContextRoutes } from './routes/context.mjs';
import { registerHealthRoute } from './routes/health.mjs';
import { registerMcpRoutes } from './routes/mcp.mjs';
import { registerCodeActionRoutes } from './routes/code-actions.mjs';
import { getOpenApiSpec } from './lib/openapi.mjs';
import { rateLimit, getAllProviderBucketStats } from './lib/rate-limit.mjs';
import { registerSkillRoutes } from './routes/skills.mjs';
import { registerPlannerRoutes } from './routes/planner.mjs';
import { registerAgentRunRoutes } from './routes/agent-runs.mjs';
import { registerUiUxRoutes } from './routes/uiux.mjs';
import { SprintEngine } from './lib/sprint-engine.mjs';
import { AgentOrchestrator } from './agent/orchestrator.mjs';
import { AutoWatcher } from './lib/auto-watcher.mjs';
import { AgentJobQueue } from './agent/job-queue.mjs';
import { authMiddleware } from './lib/auth.mjs';
import { runDiscovery } from './lib/discovery.mjs';
import { requestIdMiddleware } from './lib/request-id.mjs';
import { registerCleanup } from './lib/shutdown.mjs';
import { startAutoBackup } from './lib/backup.mjs';
import { loadBlacklist, startBlacklistCleanup } from './lib/token-blacklist.mjs';
import { registerTrustRoutes } from './routes/trust.mjs';
import { DecisionEngine } from './lib/decision-engine.mjs';
import { registerDecisionRoutes } from './routes/decisions.mjs';

export async function createServer(options = {}) {
  const port = options.port || 4217;
  const projectRoot = options.projectRoot || process.cwd();
  const log = options.log || logger;

  const app = express();
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  const corsOrigins = options.corsOrigin
    ? options.corsOrigin.split(',').map((s) => s.trim())
    : [/^https?:\/\/localhost/, /^https?:\/\/127\.0\.0\.1/];
  app.use(cors({ origin: corsOrigins }));

  app.use(express.json({ limit: '1mb' }));

  const authToken = process.env.NOKTA_API_KEY;
  if (authToken) {
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      const provided = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (provided !== authToken) {
        return res.status(401).json({ error: 'Unauthorized', status: 401 });
      }
      next();
    });
  }

  // Optional auth before rate limit so tier-aware limiting works
  app.use(authMiddleware(false));
  app.use(rateLimit({ windowMs: 60000, max: options.rateLimit || 100 }));

  migrate();

  loadBlacklist();
  startBlacklistCleanup();

  registerAuthRoutes(app);

  const providerManager = new ProviderManager({ log });
  await providerManager.initDefaults();
  providerManager.health().catch(() => {});

  const costTracker = new CostTracker();
  const gateKeeper = new GateKeeper();
  const chatHandler = new ChatHandler(providerManager, { projectRoot, log, costTracker, gateKeeper });

  registerChatRoutes(app, chatHandler, providerManager);
  registerCompleteRoutes(app, providerManager);
  registerAgentRoutes(app, providerManager, log);
  registerProviderRoutes(app, providerManager);
  registerCostRoutes(app, costTracker);
  registerGateRoutes(app, gateKeeper);
  registerTrailRoutes(app);

  app.get('/api/v1/rate-limits', (req, res) => {
    const stats = getAllProviderBucketStats();
    res.json({ providers: stats });
  });
  registerSearchRoutes(app);
  registerContextRoutes(app);
  registerMcpRoutes(app, log);
  registerCodeActionRoutes(app, chatHandler);
  registerHealthRoute(app, providerManager);
  registerSkillRoutes(app, log);
  registerUiUxRoutes(app, log);
  registerTrustRoutes(app);

  const { registerBillingRoutes } = await import('./routes/billing.mjs');
  await registerBillingRoutes(app);

  const sprintEngine = new SprintEngine(projectRoot, { log, chatHandler });
  registerPlannerRoutes(app, sprintEngine);

  const decisionEngine = new DecisionEngine(projectRoot, { log });
  registerDecisionRoutes(app, decisionEngine);

  const orchestrator = new AgentOrchestrator(projectRoot, { log, providerManager, chatHandler, sprintEngine });
  const jobQueue = new AgentJobQueue({ concurrency: 2, log });
  jobQueue.start();
  registerAgentRunRoutes(app, orchestrator, log, jobQueue);

  // Autonomous file watcher — watches, updates sprints, and creates agent runs
  const watcher = new AutoWatcher(projectRoot, {
    log,
    debounceMs: 2000,
    orchestrator,
    sprintEngine,
  });
  watcher.start();

  registerCleanup(() => watcher.stop());
  registerCleanup(() => jobQueue.stop());

  startAutoBackup();

  // Background discovery on daemon start (runs in background, never blocks)
  runDiscovery(false)
    .then((report) => {
      if (report.summary.totalDiscovery > 0) {
        log.info(
          `Discovery found ${report.summary.totalDiscovery} items (${report.summary.githubRepos} repos, ${report.summary.npmPackages} packages, ${report.summary.sourceUpdates} updates)`,
        );
      }
    })
    .catch((err) => {
      log.debug('Discovery failed:', err.message);
    });

  app.get('/api/v1/openapi.json', (req, res) => {
    res.json(getOpenApiSpec('0.3.0'));
  });

  app.get('/api/v1/docs', (req, res) => {
    res.send(
      '<!DOCTYPE html><html><head><title>Nokta API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({ url: \'/api/v1/openapi.json\', dom_id: \'#swagger-ui\' })</script></body></html>',
    );
  });

  const publicDir = new URL('./public', import.meta.url).pathname;
  app.use(express.static(publicDir));
  app.get('/', (req, res) => res.sendFile(publicDir + '/index.html'));

  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const message = err.status ? err.message : 'Internal server error';
    if (!err.status) {
      log.error('Unhandled error', { requestId: req.id, error: err.message, method: req.method, path: req.path });
    }
    res.status(status).json({ error: message, status, requestId: req.id });
  });

  return { app, providerManager, chatHandler, sprintEngine, port };
}
