import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WorkspaceService } from '../daemon/workspace/service.mjs';
import { createWorkspaceApp, listenAvailable } from '../daemon/workspace/server.mjs';
import { inspectProjectTooling } from '../daemon/lib/tool-detector.mjs';
import { collectGitHubContext } from '../daemon/lib/github-context.mjs';

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

// A fresh page view fires /context and /prompt within milliseconds of each
// other; without in-flight sharing both miss the TTL cache and every GitHub
// call is spent twice on identical data.
test('concurrent context and prompt requests share one inspection', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-http-dedupe-'));
  const repo = path.join(dir, 'repo');
  await fs.mkdir(repo);
  const service = new WorkspaceService({ dataDir: dir, skills: { select: async () => [] }, runner: { run: async () => ({ summary: 'No further work', tasks: [] }) } });
  await service.load();
  let toolingCalls = 0;
  let githubCalls = 0;
  const app = createWorkspaceApp(service, {
    inspectTooling: async rootPath => { toolingCalls += 1; return inspectProjectTooling(rootPath); },
    collectGitHub: async rootPath => { githubCalls += 1; return collectGitHubContext(rootPath); },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Nokta-Workspace': '1', 'Content-Type': 'application/json' };
  const created = await fetch(`${base}/api/workspace/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'Dedupe project', rootPath: repo, goal: 'Share the inspection.', executionModel: 'author', verificationModel: 'reviewer', checks: [] }) }).then(res => res.json());

  const [context, promptResponse] = await Promise.all([
    fetch(`${base}/api/workspace/projects/${created.id}/context`, { headers }),
    fetch(`${base}/api/workspace/projects/${created.id}/prompt`, { headers }),
  ]);
  assert.equal(context.status, 200);
  assert.equal(promptResponse.status, 200);
  assert.equal(toolingCalls, 1, 'the cold-cache concurrent pair must join one tooling inspection');
  assert.equal(githubCalls, 1, 'the cold-cache concurrent pair must join one GitHub inspection');

  // A follow-up call inside the TTL window reuses the settled result.
  await fetch(`${base}/api/workspace/projects/${created.id}/context`, { headers });
  assert.equal(toolingCalls, 1, 'settled inspections are reused inside the TTL window');
  assert.equal(githubCalls, 1, 'settled inspections are reused inside the TTL window');
});

test('discovery lists app candidates with their agent and added state', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-http-discover-'));
  await fs.mkdir(path.join(dir, 'repo'));
  await fs.mkdir(path.join(dir, 'other-app'));
  // The service stores realpath'd roots; the discovery answer must match.
  const repo = await fs.realpath(path.join(dir, 'repo'));
  const other = await fs.realpath(path.join(dir, 'other-app'));
  await fs.writeFile(path.join(repo, 'package.json'), '{}');
  await fs.writeFile(path.join(other, '.cursorrules'), 'conventions\n');
  const service = new WorkspaceService({ dataDir: dir, skills: { select: async () => [] }, runner: { run: async () => ({ summary: 'No further work', tasks: [] }) } });
  await service.load();
  await service.add({ name: 'Existing app', rootPath: repo, goal: 'Ship it.', executionModel: 'author', verificationModel: 'reviewer', checks: [] });
  const app = createWorkspaceApp(service, {
    discover: async () => ({ roots: ['/scan-root'], scanned: 3, truncated: false, candidates: [
      { path: repo, name: 'repo', hasGit: false, manifests: ['package.json'] },
      { path: other, name: 'other-app', hasGit: false, manifests: [] },
      { path: path.join(repo, 'packages'), name: 'packages', hasGit: false, manifests: [] },
      { path: path.dirname(repo), name: 'workspace-dir', hasGit: false, manifests: [] },
    ] }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Nokta-Workspace': '1' };

  // The read-only scan keeps the same local-only guard as every other route.
  assert.equal((await fetch(`${base}/api/workspace/discover`)).status, 403, 'the workspace header is required');
  assert.equal((await fetch(`${base}/api/workspace/discover`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403, 'cross-origin scans are denied');

  const response = await fetch(`${base}/api/workspace/discover`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.roots, ['/scan-root']);
  assert.equal(body.truncated, false);
  const existing = body.candidates.find(candidate => candidate.path === repo);
  assert.equal(existing.added, true, 'a registered folder is marked as already added');
  assert.equal(existing.overlaps, null, 'an exact match is not also reported as an overlap');
  assert.equal(existing.agent, null, 'a bare manifest identifies no coding agent');
  const fresh = body.candidates.find(candidate => candidate.path === other);
  assert.equal(fresh.added, false);
  assert.equal(fresh.overlaps, null);
  assert.equal(fresh.agent, 'Cursor', 'the detected agent is reported per candidate');
  const nested = body.candidates.find(candidate => candidate.name === 'packages');
  assert.equal(nested.added, false);
  assert.equal(nested.overlaps, 'Existing app', 'a folder inside a registered project names the project it clashes with');
  const container = body.candidates.find(candidate => candidate.name === 'workspace-dir');
  assert.equal(container.added, false);
  assert.equal(container.overlaps, 'Existing app', 'a folder containing a registered project is an overlap too');
});
