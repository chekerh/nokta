import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProjectTooling, detectProjectTools } from '../lib/tool-detector.mjs';
import { collectGitHubContext } from '../lib/github-context.mjs';
import { discoverApps, scanRoots } from '../lib/app-discovery.mjs';
import { overlapsRoot } from './service.mjs';
import { buildAgentPrompt } from '../lib/prompt-builder.mjs';

export function localOnly(req, res, next) {
  const address = req.socket.remoteAddress;
  const host = req.headers.host || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return res.status(403).json({ error: 'Workspace access is local-only' });
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({ error: 'Cross-origin workspace access denied' });
  if (req.path.startsWith('/api/') && req.headers['x-nokta-workspace'] !== '1') return res.status(403).json({ error: 'Workspace request header required' });
  next();
}

export function createWorkspaceApp(service, { inspectTooling = inspectProjectTooling, collectGitHub = collectGitHubContext, discover = discoverApps } = {}) {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'connect-src': ["'self'"], 'upgrade-insecure-requests': null } } }));
  app.use(localOnly);
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'nokta-workspace' }));
  app.get('/api/workspace', (_req, res) => res.json({ ...service.snapshot(), error: service.lastError || null }));
  app.get('/api/workspace/tools', async (_req, res) => {
    let skills = [];
    let skillsError = null;
    try { skills = await service.skills.inventory(); } catch (error) { skillsError = error.message; }
    res.json({ runners: [await service.runner.available()], skillsRoot: service.skills.root, skillsCount: skills.length, skillsError });
  });
  // Scan the configured roots (home by default) for folders that look like
  // apps, so a project can be added without hand-typing its path. Read-only:
  // the answer marks which candidates are already registered.
  app.get('/api/workspace/discover', async (_req, res) => {
    const { roots, includeRoots } = scanRoots();
    const { roots: resolvedRoots, candidates, scanned, truncated } = await discover({ roots, includeRoots });
    const projects = service.snapshot().projects;
    const apps = [];
    for (const candidate of candidates) {
      const { primary } = await detectProjectTools(candidate.path);
      const exact = projects.find(project => project.rootPath === candidate.path);
      const nested = exact ? null : projects.find(project => overlapsRoot(project.rootPath, candidate.path));
      apps.push({
        ...candidate,
        agent: primary ? primary.name : null,
        added: Boolean(exact),
        overlaps: nested ? nested.name : null,
      });
    }
    res.json({ roots: resolvedRoots, candidates: apps, scanned, truncated });
  });
  app.post('/api/workspace/projects', async (req, res) => res.status(201).json(await service.add(req.body)));
  app.patch('/api/workspace/projects/:id', async (req, res) => res.json(await service.update(req.params.id, req.body)));
  for (const action of ['analyze', 'start', 'pause']) {
    app.post(`/api/workspace/projects/:id/${action}`, async (req, res) => {
      await service[action](req.params.id);
      res.status(202).json({ accepted: true });
    });
  }
  app.post('/api/workspace/projects/:id/tasks/:taskId/retry', async (req, res) => {
    await service.retry(req.params.id, req.params.taskId);
    res.json({ accepted: true });
  });
  // Agent + GitHub context and the paste-ready prompt for one project. The
  // service keeps projects in memory (via get), so this reads live state.
  // Both routes need the same tooling + GitHub inspection, and a fresh page
  // view fires them within milliseconds of each other — so concurrent misses
  // join one in-flight promise, and settled results are shared for a short
  // window (every GitHub call counts against a 60/hr unauthenticated rate
  // limit). Only the expensive inspection is cached; the prompt is rebuilt
  // from the live project each call so it always reflects the current tasks.
  const INSPECT_TTL_MS = 45000;
  const inspections = new Map();
  function inspect(rootPath) {
    const cached = inspections.get(rootPath);
    if (cached?.inflight) return cached.inflight;
    if (cached && Date.now() - cached.at < INSPECT_TTL_MS) return cached.value;
    const entry = { at: Date.now(), value: null, inflight: null };
    entry.inflight = Promise.all([inspectTooling(rootPath), collectGitHub(rootPath)])
      .then(([tooling, github]) => {
        entry.value = { tooling, github };
        entry.inflight = null;
        return entry.value;
      })
      .catch(error => {
        // Only clear the entry this failure belongs to; a newer inspection for
        // the same path (after TTL/eviction) must not be dropped by a stale one.
        if (inspections.get(rootPath) === entry) inspections.delete(rootPath);
        throw error;
      });
    inspections.set(rootPath, entry);
    if (inspections.size > 100) inspections.delete(inspections.keys().next().value);
    return entry.inflight;
  }
  app.get('/api/workspace/projects/:id/context', async (req, res) => {
    const project = service.get(req.params.id);
    const { tooling, github } = await inspect(project.rootPath);
    res.json({ tooling, github });
  });
  app.get('/api/workspace/projects/:id/prompt', async (req, res) => {
    const project = service.get(req.params.id);
    const { tooling, github } = await inspect(project.rootPath);
    res.json({ prompt: buildAgentPrompt({ project, tooling, github }) });
  });
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'workspace.html')));
  app.use(express.static(publicDir, { index: false }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Workspace operation failed. Check local server logs.' }));
  return app;
}

export async function listenAvailable(app, requestedPort, { attempts = 20, host = '127.0.0.1' } = {}) {
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('Ports must be integers between 1 and 65535');
  for (let port = requestedPort; port < Math.min(requestedPort + attempts, 65536); port++) {
    try {
      const server = await new Promise((resolve, reject) => {
        const listener = app.listen(port, host);
        listener.once('error', reject);
        listener.once('listening', () => { listener.removeListener('error', reject); resolve(listener); });
      });
      return { server, port };
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`No available port within ${attempts} ports of ${requestedPort}`);
}
