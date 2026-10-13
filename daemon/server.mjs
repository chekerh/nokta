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
import { registerHealthRoute, trackRoute } from './routes/health.mjs';
import { registerMcpRoutes } from './routes/mcp.mjs';
import { registerCodeActionRoutes } from './routes/code-actions.mjs';
import { getOpenApiSpec } from './lib/openapi.mjs';
import { rateLimit, getAllProviderBucketStats } from './lib/rate-limit.mjs';
import { registerSkillRoutes } from './routes/skills.mjs';
import { registerPlannerRoutes } from './routes/planner.mjs';
import { registerFleetRoutes } from './routes/fleet.mjs';
import { FleetTransport } from './lib/fleet.mjs';
import { registerAgentRunRoutes } from './routes/agent-runs.mjs';
import { registerUiUxRoutes } from './routes/uiux.mjs';
import { SprintEngine } from './lib/sprint-engine.mjs';
import { AgentOrchestrator } from './agent/orchestrator.mjs';
import { AutoWatcher } from './lib/auto-watcher.mjs';
import { AgentJobQueue } from './agent/job-queue.mjs';
import { authMiddleware, bearerToken, requestToken, verifyToken } from './lib/auth.mjs';
import { runDiscovery } from './lib/discovery.mjs';
import { requestIdMiddleware } from './lib/request-id.mjs';
import { registerCleanup } from './lib/shutdown.mjs';
import { startAutoBackup } from './lib/backup.mjs';
import { loadBlacklist, startBlacklistCleanup } from './lib/token-blacklist.mjs';
import { startRefreshTokenCleanup } from './lib/refresh-tokens.mjs';
import { registerTrustRoutes } from './routes/trust.mjs';
import { DecisionEngine } from './lib/decision-engine.mjs';
import { ProjectManager } from './lib/project-manager.mjs';
import { UserBrain } from './lib/user-brain.mjs';
import { registerProjectRoutes } from './routes/projects.mjs';
import { registerBrainRoutes } from './routes/brain.mjs';
import { registerAdversarialRoutes } from './routes/adversarial.mjs';
import { registerSandboxRoutes } from './routes/sandbox.mjs';
import { registerSkillEvolutionRoutes } from './routes/skill-evolution.mjs';
import { metricsMiddleware, makeMetricsHandler, setGaugeSource, recordLlmTokens } from './lib/metrics.mjs';

export async function createServer(options = {}) {
  const port = options.port || 4217;
  const projectRoot = options.projectRoot || process.cwd();
  const log = options.log || logger;

  const app = express();
  // Trust X-Forwarded-For only when the operator opts in (NOKTA_TRUST_PROXY=1).
  // Default is off so a client cannot spoof the source IP used for rate
  // limiting by setting the header directly. Set it when behind a real
  // reverse proxy (nginx, Fly, etc.).
  app.set('trust proxy', process.env.NOKTA_TRUST_PROXY === '1' || process.env.NOKTA_TRUST_PROXY === 'true' ? 1 : false);
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware());
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  const corsOrigins = options.corsOrigin
    ? options.corsOrigin.split(',').map((s) => s.trim())
    : [/^https?:\/\/localhost/, /^https?:\/\/127\.0\.0\.1/];
  // Expose the correlation header so browser clients can read it off the
  // response (distinct from the UI, which is served same-origin).
  app.use(cors({ origin: corsOrigins, exposedHeaders: ['X-Request-Id'] }));

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const authToken = process.env.NOKTA_API_KEY;
  if (authToken) {
    app.use((req, res, next) => {
      if (
        req.path === '/health' ||
        req.path === '/api/v1/auth/login' ||
        req.path === '/api/v1/auth/register' ||
        req.path === '/api/v1/auth/forgot-password' ||
        req.path === '/api/v1/auth/reset-password' ||
        req.path === '/api/v1/auth/refresh' ||
        req.path === '/api/v1/openapi.json' ||
        req.path === '/api/v1/docs' ||
        req.path === '/api/v1/billing/config' ||
        req.path.startsWith('/lib/') ||
        req.path.startsWith('/assets/') ||
        req.path === '/' ||
        req.path === '/index.html' ||
        req.path === '/settings.html'
      ) {
        return next();
      }
      // EventSource cannot set Authorization headers, so the SSE stream accepts
      // its token via ?token=<jwt> instead. Everywhere else, headers only.
      const provided =
        req.path === '/api/v1/agent-runs/events' ? requestToken(req) : bearerToken(req);
      if (provided === authToken) {
        return next();
      }
      if (provided && verifyToken(provided)) {
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized', status: 401 });
    });
  }

  // Optional auth before rate limit so tier-aware limiting works
  app.use(authMiddleware(false));
  app.use(
    rateLimit({
      windowMs: 60000,
      max: options.rateLimit || 100,
      // Scraping must never be throttled by (or consume) a client's budget.
      // /health stays rate limited; only /metrics is exempt (trailing slash ok).
      skip: (req) => req.path.replace(/\/$/, '') === '/metrics',
    }),
  );

  migrate();

  loadBlacklist();
  startBlacklistCleanup();
  startRefreshTokenCleanup();

  registerAuthRoutes(app);
  trackRoute('auth');

  const providerManager = new ProviderManager({ log });
  await providerManager.initDefaults();
  providerManager.health().catch(() => {});

  const costTracker = new CostTracker({
    onTokens: (provider, tokensIn, tokensOut) => {
      recordLlmTokens(provider, 'input', tokensIn);
      recordLlmTokens(provider, 'output', tokensOut);
    },
  });
  const gateKeeper = new GateKeeper();
  const chatHandler = new ChatHandler(providerManager, { projectRoot, log, costTracker, gateKeeper });

  registerChatRoutes(app, chatHandler, providerManager);
  trackRoute('chat');
  registerCompleteRoutes(app, providerManager);
  trackRoute('complete');
  // Agent routes are registered after the orchestrator and queue exist, because
  // /api/v1/agents/:id/execute enqueues pack runs through them.
  trackRoute('agents');
  registerProviderRoutes(app, providerManager);
  trackRoute('providers');
  registerCostRoutes(app, costTracker);
  trackRoute('costs');
  registerGateRoutes(app, gateKeeper);
  trackRoute('gates');
  registerTrailRoutes(app);
  trackRoute('trail');

  app.get('/api/v1/rate-limits', (req, res) => {
    const stats = getAllProviderBucketStats();
    res.json({ providers: stats });
  });
  registerSearchRoutes(app);
  trackRoute('search');
  registerContextRoutes(app);
  trackRoute('context');
  registerMcpRoutes(app, log);
  trackRoute('mcp');
  registerCodeActionRoutes(app, chatHandler);
  trackRoute('code-actions');
  registerHealthRoute(app, providerManager);
  app.get('/metrics', makeMetricsHandler());
  trackRoute('metrics');
  registerSkillRoutes(app, log);
  trackRoute('skills');
  registerUiUxRoutes(app, log);
  trackRoute('uiux');
  registerTrustRoutes(app);
  trackRoute('trust');

  const { registerBillingRoutes } = await import('./routes/billing.mjs');
  await registerBillingRoutes(app);
  trackRoute('billing');

  const { registerAdminRoutes } = await import('./routes/admin.mjs');
  registerAdminRoutes(app);
  trackRoute('admin');

  const projectManager = new ProjectManager({ log });
  registerProjectRoutes(app, projectManager);
  trackRoute('projects');

  const userBrain = new UserBrain({ log });
  registerBrainRoutes(app, userBrain);
  trackRoute('brain');

  registerAdversarialRoutes(app, chatHandler, log);
  trackRoute('adversarial');

  registerSandboxRoutes(app, log);
  trackRoute('sandbox');

  registerSkillEvolutionRoutes(app, projectRoot, log);
  trackRoute('skill-evolution');

  const decisionEngine = new DecisionEngine(projectRoot, { log });

  // decisionEngine must be constructed before SprintEngine — SprintEngine keeps the
  // reference at construction time, and every decision-link method hard-fails without it.
  const sprintEngine = new SprintEngine(projectRoot, { log, chatHandler, decisionEngine });
  registerPlannerRoutes(app, sprintEngine);
  trackRoute('planner');

  const fleet = new FleetTransport(projectRoot, { log });
  registerFleetRoutes(app, fleet);
  trackRoute('fleet');

  const orchestrator = new AgentOrchestrator(projectRoot, { log, providerManager, chatHandler, sprintEngine });
  const jobQueue = new AgentJobQueue({ concurrency: 2, log });
  jobQueue.start();
  setGaugeSource(() => ({
    activeRuns: jobQueue.getActiveCount(),
    queueLength: jobQueue.getQueueLength(),
  }));
  registerAgentRunRoutes(app, orchestrator, log, jobQueue);
  registerAgentRoutes(app, providerManager, log, orchestrator, jobQueue);
  trackRoute('agent-runs');

  // Autonomous file watcher — watches, updates sprints, and creates agent runs.
  // It reacts to ANY file change, including edits a human is making by hand,
  // and the run it triggers can commit the working tree. Set
  // NOKTA_AUTO_WATCHER=false to keep the daemon read-mostly while doing
  // manual work. Defaults to enabled so autonomous operation is unchanged.
  const autoWatcherEnabled = process.env.NOKTA_AUTO_WATCHER !== 'false';
  if (autoWatcherEnabled) {
    const watcher = new AutoWatcher(projectRoot, {
      log,
      debounceMs: 2000,
      orchestrator,
      sprintEngine,
    });
    watcher.start();
    registerCleanup(() => watcher.stop());
  } else {
    log.info('AutoWatcher disabled via NOKTA_AUTO_WATCHER=false', { module: 'daemon' });
  }
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
    res.status(status).json({
      error: status === 500 ? 'Internal server error' : message,
      status,
      ...(err.details && typeof err.details === 'object' ? err.details : {}),
      requestId: req.id,
    });
  });

  return { app, providerManager, chatHandler, sprintEngine, port };
}
