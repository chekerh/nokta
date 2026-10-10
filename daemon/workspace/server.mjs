import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function localOnly(req, res, next) {
  const address = req.socket.remoteAddress;
  const host = req.headers.host || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return res.status(403).json({ error: 'Workspace access is local-only' });
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({ error: 'Cross-origin workspace access denied' });
  if (req.path.startsWith('/api/') && req.headers['x-nokta-workspace'] !== '1') return res.status(403).json({ error: 'Workspace request header required' });
  next();
}

export function createWorkspaceApp(service) {
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
