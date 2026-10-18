import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WorkspaceService } from '../daemon/workspace/service.mjs';
import { createWorkspaceApp, listenAvailable } from '../daemon/workspace/server.mjs';

test('HTTP project flow and multi-port fallback share state', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-http-'));
  const repo = path.join(dir, 'repo'); await fs.mkdir(repo);
  const service = new WorkspaceService({ dataDir: dir, skills: { select: async () => [] }, runner: { run: async () => ({ summary: 'No further work', tasks: [] }) } });
  await service.load();
  const app = createWorkspaceApp(service);
  const first = app.listen(0, '127.0.0.1');
  await once(first, 'listening');
  const port = first.address().port;
  const second = await listenAvailable(app, port);
  t.after(async () => { first.closeAllConnections(); second.server.closeAllConnections(); await Promise.all([new Promise(resolve => first.close(resolve)), new Promise(resolve => second.server.close(resolve))]); await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  assert.notEqual(port, second.port);
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'X-Nokta-Workspace': '1', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/workspace`)).status, 403);
  assert.equal((await fetch(`${base}/api/workspace`, { headers: { ...headers, Origin: 'https://other.example' } })).status, 403);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.match(await page.text(), /Your projects/);
  const response = await fetch(`${base}/api/workspace/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'HTTP project', rootPath: repo, goal: 'Inspect real source', executionModel: 'author', verificationModel: 'reviewer', checks: [['node', '--test']] }) });
  assert.equal(response.status, 201);
  const project = await response.json();
  const mirrored = await fetch(`http://127.0.0.1:${second.port}/api/workspace`, { headers }).then(res => res.json());
  assert.equal(mirrored.projects[0].id, project.id);
  const analyzed = await fetch(`${base}/api/workspace/projects/${project.id}/analyze`, { method: 'POST', headers });
  assert.equal(analyzed.status, 202);
  while (service.worker) await service.worker;
  assert.equal(service.get(project.id).analysis, 'No further work');
  assert.equal((await fetch(`${base}/api/workspace/projects/unknown/start`, { method: 'POST', headers })).status, 404);
});

test('context and prompt routes report agent, GitHub state, and a paste-ready prompt', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-http-ctx-'));
  const repo = path.join(dir, 'repo');
  await fs.mkdir(path.join(repo, '.claude'), { recursive: true });
  await fs.writeFile(path.join(repo, 'CLAUDE.md'), '# conventions');
  const service = new WorkspaceService({ dataDir: dir, skills: { select: async () => [] }, runner: { run: async () => ({ summary: 'No further work', tasks: [] }) } });
  await service.load();
  const app = createWorkspaceApp(service);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Nokta-Workspace': '1', 'Content-Type': 'application/json' };
  const created = await fetch(`${base}/api/workspace/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'Ctx project', rootPath: repo, goal: 'Surface the agent and repo state.', executionModel: 'author', verificationModel: 'reviewer', checks: [['npm', 'test']] }) }).then(res => res.json());

  const context = await fetch(`${base}/api/workspace/projects/${created.id}/context`, { headers }).then(res => res.json());
  assert.equal(context.tooling.primary.id, 'claude-code', 'the detected agent must be reported');
  assert.ok(context.github, 'github context must be present even when unavailable');
  assert.ok(!('remoteUrl' in context), 'raw remote URLs (which can embed credentials) must never be in the payload');

  const { prompt } = await fetch(`${base}/api/workspace/projects/${created.id}/prompt`, { headers }).then(res => res.json());
  assert.match(prompt, /You are Claude Code/, 'the prompt must address the detected agent');
  assert.match(prompt, /Surface the agent and repo state/, 'the prompt must carry the project goal');
  assert.match(prompt, /npm test/, 'the prompt must carry the configured checks');

  const missing = await fetch(`${base}/api/workspace/projects/nope/prompt`, { headers });
  assert.equal(missing.status, 404);
});
