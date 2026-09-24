import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceService } from '../daemon/workspace/service.mjs';
import { LocalSkills } from '../daemon/workspace/skills.mjs';
import { runCommand } from '../daemon/workspace/runner.mjs';
import { localOnly } from '../daemon/workspace/server.mjs';

const candidate = { title: 'Fix a reproducible defect', description: 'Inspect and repair the defect with a regression test.', priority: 'P1', acceptanceCriteria: ['Regression test passes'] };
const config = { name: 'Example', goal: 'Fix defects and verify the result', executionModel: 'executor-model', verificationModel: 'reviewer-model', checks: [['node', '--test']], taskLimit: 3 };
async function setup(t, options = {}) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-workspace-test-')));
  const rootPath = path.join(dir, 'repo');
  await fs.mkdir(rootPath);
  const calls = [];
  const runner = { available: async () => ({ installed: true }), run: async request => {
    calls.push(request);
    if (request.phase === 'analyze') return { summary: 'One defect identified', tasks: [candidate] };
    if (request.phase === 'execute') return { summary: 'Implemented', completed: true };
    return { summary: 'Verified independently', approved: true, issues: [] };
  } };
  const service = new WorkspaceService({ dataDir: path.join(dir, 'state'), runner, skills: { select: async () => [] }, command: async () => ({ code: 0, output: 'Tests passed', error: null }), ...options });
  await service.load();
  t.after(async () => { await service.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return { service, rootPath, calls, dir };
}
async function idle(service) {
  while (service.worker) await service.worker;
}

test('autopilot analyzes, tests, independently verifies, and persists completion', async t => {
  const { service, rootPath, calls } = await setup(t);
  const project = await service.add({ ...config, rootPath });
  await service.start(project.id);
  await idle(service);
  const result = service.get(project.id);
  assert.equal(result.tasks[0].status, 'done');
  assert.equal(result.enabled, false);
  assert.deepEqual(calls.map(call => call.phase), ['analyze', 'execute', 'review']);
  assert.equal(calls[2].model, 'reviewer-model');
  assert.ok(calls.every(call => call.rootPath === rootPath));
  assert.equal(result.tasks[0].attempts[0].checks[0].code, 0);
  assert.equal(JSON.parse(await fs.readFile(service.file)).projects[0].tasks[0].status, 'done');
});

test('failed checks get one repair and cannot reach done or review', async t => {
  const { service, rootPath, calls } = await setup(t, { command: async () => ({ code: 1, output: 'Regression failed', error: 'Command exited 1' }) });
  const project = await service.add({ ...config, rootPath });
  await service.start(project.id); await idle(service);
  const result = service.get(project.id);
  assert.equal(result.status, 'blocked');
  assert.equal(result.tasks[0].status, 'blocked');
  assert.equal(result.tasks[0].attempts.length, 2);
  assert.equal(calls.filter(call => call.phase === 'review').length, 0);
  await service.retry(project.id, result.tasks[0].id);
  assert.equal(result.tasks[0].status, 'ready');
});

test('review rejection triggers repair before a fresh review', async t => {
  let reviews = 0;
  const runner = { run: async ({ phase }) => phase === 'analyze' ? { summary: 'Needs repair', tasks: [candidate] } : phase === 'execute' ? { summary: 'Changed', completed: true } : ++reviews === 1 ? { summary: 'Missing case', approved: false, issues: ['Add edge case'] } : { summary: 'Fixed', approved: true, issues: [] } };
  const { service, rootPath } = await setup(t, { runner });
  const project = await service.add({ ...config, rootPath });
  await service.start(project.id); await idle(service);
  assert.equal(service.get(project.id).tasks[0].status, 'done');
  assert.equal(reviews, 2);
});

test('same models, overlapping roots and missing checks are rejected', async t => {
  const { service, rootPath } = await setup(t);
  await assert.rejects(service.add({ ...config, rootPath, verificationModel: config.executionModel }), /different/);
  const project = await service.add({ ...config, rootPath, checks: [] });
  await assert.rejects(service.start(project.id), /at least one/);
  await assert.rejects(service.add({ ...config, rootPath }), /already registered/);
  const child = path.join(rootPath, 'child'); await fs.mkdir(child);
  await assert.rejects(service.add({ ...config, rootPath: child }), /overlapping/);
  await assert.rejects(service.update(project.id, { checks: ['npm test'] }), /argument arrays/);
});

test('analysis is read-only planning and deduplicates existing tasks', async t => {
  const { service, rootPath, calls } = await setup(t);
  const project = await service.add({ ...config, rootPath });
  await service.analyze(project.id); await idle(service);
  await service.analyze(project.id); await idle(service);
  assert.equal(service.get(project.id).tasks.length, 1);
  assert.equal(service.get(project.id).tasks[0].status, 'ready');
  assert.deepEqual(calls.map(call => call.phase), ['analyze', 'analyze']);
});

test('pause cancels in-flight execution, preserves changes and prevents verification', async t => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const runner = { run: async ({ phase, signal }) => {
    if (phase === 'analyze') return { summary: 'Plan', tasks: [candidate] };
    assert.equal(phase, 'execute');
    entered();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Paused by user')), { once: true }));
  } };
  const { service, rootPath } = await setup(t, { runner });
  const project = await service.add({ ...config, rootPath });
  await service.start(project.id); await started;
  await assert.rejects(service.start(project.id), /already/);
  await assert.rejects(service.update(project.id, { goal: 'Another goal' }), /Pause/);
  await service.pause(project.id); await idle(service);
  assert.equal(service.get(project.id).status, 'paused');
  assert.equal(service.get(project.id).tasks[0].status, 'blocked');
});

test('restart pauses unfinished work instead of silently running paid jobs', async t => {
  const { service, rootPath } = await setup(t);
  const project = await service.add({ ...config, rootPath });
  Object.assign(service.get(project.id), { enabled: true, status: 'running', tasks: [{ ...candidate, id: 'interrupted', status: 'testing', attempts: [] }] });
  await service.persist();
  const loaded = new WorkspaceService({ dataDir: path.dirname(service.file) });
  await loaded.load();
  assert.equal(loaded.get(project.id).status, 'paused');
  assert.equal(loaded.get(project.id).tasks[0].status, 'blocked');
  assert.equal(loaded.queue.length, 0);
});

test('two repositories are isolated and task limits prevent indefinite execution', async t => {
  const calls = [];
  const runner = { run: async request => {
    calls.push({ phase: request.phase, root: request.rootPath });
    if (request.phase === 'analyze') return { summary: 'Two needs', tasks: [candidate, { ...candidate, title: 'Second independent need' }] };
    if (request.phase === 'execute') return { summary: 'Done', completed: true };
    return { summary: 'Verified', approved: true, issues: [] };
  } };
  const { service, rootPath, dir } = await setup(t, { runner });
  const otherPath = path.join(dir, 'other'); await fs.mkdir(otherPath);
  const first = await service.add({ ...config, rootPath, taskLimit: 1 });
  const second = await service.add({ ...config, rootPath: otherPath, taskLimit: 1 });
  await Promise.all([service.start(first.id), service.start(second.id)]); await idle(service);
  for (const id of [first.id, second.id]) {
    assert.deepEqual(service.get(id).tasks.map(task => task.status), ['done', 'ready']);
    assert.equal(service.get(id).remaining, 0);
  }
  assert.equal(calls.filter(call => call.phase === 'execute' && call.root === rootPath).length, 1);
  assert.equal(calls.filter(call => call.phase === 'execute' && call.root === otherPath).length, 1);
});

test('local skills selection is bounded and excludes linked folders', async t => {
  const { dir } = await setup(t);
  const skillsDir = path.join(dir, 'skills');
  for (let i = 0; i < 7; i++) {
    const folder = path.join(skillsDir, `testing-${i}`); await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'SKILL.md'), `---\ndescription: testing node regressions\n---\n${'guide '.repeat(1500)}`);
  }
  await fs.symlink(dir, path.join(skillsDir, 'linked'));
  const skills = new LocalSkills(skillsDir);
  assert.equal((await skills.inventory()).length, 7);
  const selected = await skills.select('testing');
  assert.equal(selected.length, 4);
  assert.ok(selected.every(skill => skill.content.length <= 6000));
});

test('a missing skills directory is treated as an empty optional toolkit', async t => {
  const { service, rootPath } = await setup(t, { skills: new LocalSkills(path.join(os.tmpdir(), 'nokta-skills-that-does-not-exist')) });
  const project = await service.add({ ...config, rootPath });
  await service.analyze(project.id);
  await idle(service);
  assert.equal(service.get(project.id).analysis, 'One defect identified');
});

test('local routes reject cross-origin, non-local and headerless requests', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:4317', 'x-nokta-workspace': '1' }, path: '/api/workspace' };
  function check(req) {
    let status = 200; let next = false;
    localOnly(req, { status: code => { status = code; return { json: () => {} }; } }, () => { next = true; });
    return { status, next };
  }
  assert.equal(check(request).next, true);
  assert.equal(check({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }).status, 403);
  assert.equal(check({ ...request, headers: { ...request.headers, host: 'evil.example' } }).status, 403);
  assert.equal(check({ ...request, headers: { host: request.headers.host } }).status, 403);
  assert.equal(check({ ...request, socket: { remoteAddress: '10.0.0.2' } }).status, 403);
});

test('command runner uses cwd, passes arguments literally and records failures', async t => {
  const { rootPath } = await setup(t);
  const output = await runCommand(process.execPath, ['-e', 'console.log(process.cwd()); console.log(process.argv[1])', '$(echo injection)'], { cwd: rootPath });
  assert.equal(output.code, 0);
  assert.ok(output.output.includes(rootPath));
  assert.ok(output.output.includes('$(echo injection)'));
  const failure = await runCommand(process.execPath, ['-e', 'process.exit(3)'], { cwd: rootPath });
  assert.equal(failure.code, 3);
});

test('configured checks cannot read Codex or provider credentials', async t => {
  const { rootPath } = await setup(t);
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-secret-that-must-not-leak';
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write(process.env.OPENAI_API_KEY || "missing")'], { cwd: rootPath });
  assert.equal(result.code, 0);
  assert.equal(result.output, 'missing');
});

test('command runner times out and terminates the child', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 40 });
  assert.equal(result.error, 'Command timed out');
});
