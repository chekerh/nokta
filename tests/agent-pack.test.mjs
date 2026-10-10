import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fsSync from 'node:fs';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-pack-test-'));
process.env.NOKTA_DATA_DIR = dataDir;

const { prepare, closeDb } = await import('../daemon/db/connection.mjs');
const { migrate } = await import('../daemon/db/schema.mjs');
const dbStorage = await import('../daemon/agent/db-storage.mjs');
const { loadAgentPacks, resolveAgentPack, buildAgentPersona, buildPackSteps, auditCitations } =
  await import('../daemon/agent/agent-pack.mjs');
const { AgentOrchestrator } = await import('../daemon/agent/orchestrator.mjs');

migrate();
const { execFileSync } = await import('node:child_process');
const USER_ID = 'usr_pack_test';

// A real git repo, because the evidence step reads `git ls-files` and the
// citation audit resolves paths against the project root.
function makeRepo(t, files = {}) {
  const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nokta-packrepo-'));
  t.after(() => fsSync.rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@nokta.local']);
  git(['config', 'user.name', 'Nokta Test']);
  for (const [name, content] of Object.entries(files)) {
    fsSync.writeFileSync(path.join(root, name), content, 'utf8');
  }
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'initial']);
  return root;
}
prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
  USER_ID,
  'pack@test.local',
  'Pack Test',
  'x',
);

test.after(() => closeDb());

const stubSkills = { select: async () => [] };
const stubSkillsWith = (skills) => ({ select: async () => skills });

// A chatHandler that records what it was actually sent. The point of the pack
// feature is that the persona reaches the model, so assert on the prompt rather
// than on the steps alone.
function recordingChatHandler() {
  const seen = [];
  return {
    seen,
    handleChat: async (messages) => {
      seen.push(messages);
      return { content: `deliverable for turn ${seen.length}`, provider: 'stub', model: 'stub' };
    },
  };
}

test('the shipped catalog loads and every pack is resolvable by all three ids', async () => {
  const packs = await loadAgentPacks();
  assert.ok(packs.length >= 250, `expected the full catalog, got ${packs.length}`);
  for (const pack of packs) {
    assert.ok(pack.id, 'every pack needs an id');
    assert.equal(resolveAgentPack(pack.id, packs)?.id, pack.id, `id lookup failed: ${pack.id}`);
    assert.ok(
      resolveAgentPack(
        String(pack.title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-'),
        packs,
      ),
      `title slug lookup failed: ${pack.title}`,
    );
  }
  assert.equal(resolveAgentPack('no-such-agent', packs), null);
  assert.equal(resolveAgentPack(undefined, packs), null);
});

test("persona carries the pack's own words into the system prompt", () => {
  const pack = {
    id: 'agent.demo',
    title: 'Demo Reviewer',
    role: 'Reviews demo output.',
    scope: ['demo scope'],
    outputs: ['demo report'],
    cannotDo: ['invent demo findings'],
    handoff: ['demo handoff'],
  };
  const persona = buildAgentPersona(pack);
  assert.match(persona, /You are Demo Reviewer/);
  assert.match(persona, /Reviews demo output/);
  assert.match(persona, /demo scope/);
  assert.match(persona, /demo report/);
  assert.match(persona, /invent demo findings/);
  // A pack that declares nothing must still produce a usable persona rather than
  // a run with an empty system prompt.
  assert.match(buildAgentPersona({ title: 'Bare' }), /You are Bare/);
});

test('pack steps are fixed and cannot author an edit step', () => {
  const pack = { id: 'agent.demo', title: 'Demo', role: 'r', scope: ['s'], outputs: ['o'], cannotDo: ['c'] };
  const steps = buildPackSteps({ pack, goal: 'do the thing' });
  assert.equal(steps.length, 3);
  assert.equal(steps[0].type, 'inspect', 'the run must look before it reasons');
  for (const step of steps.slice(1)) {
    assert.equal(step.type, 'prompt');
  }
  // Nothing in a pack run can write, and the only execution is read-only.
  for (const step of steps) {
    assert.ok(!('file' in step) && !('command' in step), 'a pack step must not be able to write');
  }
  for (const command of steps[0].commands) {
    assert.equal(isReadOnlyCommand(command), true, `evidence command not read-only: ${command}`);
  }
  assert.match(steps[2].systemPrompt, /final deliverable/i);
  assert.match(steps[1].messages[0].content, /do the thing/);
});

test('both pack steps carry the evidence, and forbid claiming to have run anything', () => {
  const pack = { id: 'agent.demo', title: 'Demo', role: 'r' };
  const steps = buildPackSteps({
    pack,
    goal: 'audit the thing',
    skills: [{ name: 'demo-skill', description: 'a demo skill', content: '# demo' }],
    projectContext: {
      packageName: 'demo',
      stack: 'JavaScript',
      fileTypes: ['.mjs'],
      topLevel: ['daemon/'],
      entrypoints: ['daemon/index.mjs'],
      testCommand: 'test',
      lintCommand: 'lint',
      testFiles: ['tests/demo.test.mjs'],
      sampleFiles: ['daemon/server.mjs', 'daemon/index.mjs'],
      truncated: false,
    },
  });
  assert.equal(steps[0].type, 'inspect');
  for (const [i, step] of steps.slice(1).entries()) {
    const text = JSON.stringify(step);
    assert.match(text, /Evidence rules/, `prompt step ${i} must carry the evidence contract`);
    assert.ok(text.includes('daemon/server.mjs'), `prompt step ${i} must carry the repo context`);
    assert.ok(text.includes('demo-skill'), `prompt step ${i} must carry the skills`);
    assert.match(step.systemPrompt, /no tools/i);
    assert.match(step.systemPrompt, /Never claim to have executed/i);
  }
});

test('citation audit separates real files from invented ones', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-cites-'));
  await fs.writeFile(path.join(repo, 'daemon.mjs'), '', 'utf8');
  await fs.mkdir(path.join(repo, 'docs'));
  await fs.writeFile(path.join(repo, 'docs', 'real.md'), '', 'utf8');

  // A real file, a real file with a line ref, a markdown link, a real dir with a
  // trailing slash, prose that is not a path, a URL, and the fabrication that
  // actually shipped ("Status: Found" on a file that does not exist).
  const text = [
    'See `daemon.mjs` and `docs/real.md:42`.',
    '[link](docs/real.md)',
    'The `docs/` directory and `daemon/` hold it.',
    'Run `npm test` and see https://example.com/thing.md',
    '**File:** `docs/LOOP-DESIGN.md`',
    '**Status:** Found',
    'Also `src/loop.ts` and `package.json` (absent here).',
  ].join('\n');

  const audit = await auditCitations(text, repo);
  assert.deepEqual(audit.missing, ['docs/LOOP-DESIGN.md', 'package.json', 'src/loop.ts']);
  assert.ok(audit.checked >= 5);
  // Neither a URL fragment nor a traversal claim is probed or reported.
  assert.ok(!audit.missing.some((p) => p.includes('com/') || p.includes('..')));
  // A real file with a line reference and a markdown link both resolve.
  assert.ok(!audit.missing.includes('docs/real.md'));
});

test('a deliverable citing invented files is flagged, not rewritten', async (t) => {
  const repo = makeRepo(t, { 'real.mjs': 'ORIGINAL\n' });
  const chatHandler = {
    handleChat: async (messages) => {
      const last = messages[messages.length - 1].content;
      // The deliverable step is the one that writes the final answer, and it is
      // the one whose citations get audited.
      const cited = last.includes('Write the deliverable now') ? 'ghost.mjs' : 'real.mjs';
      return { content: `Findings.\n\n**File:** \`${cited}\``, provider: 'stub' };
    },
  };
  const orchestrator = new AgentOrchestrator(repo, { chatHandler, skills: stubSkills, isolation: false });
  const packs = await loadAgentPacks();
  const created = await orchestrator.executeAgentPack({ pack: packs[0], goal: 'check', userId: USER_ID });
  await orchestrator.executeRun(created.id, USER_ID);

  const d = dbStorage.getRunById(USER_ID, created.id).metadata.deliverable;
  // The research step's fiction is quoted in the final deliverable.
  assert.deepEqual(d.unverifiedPaths, ['ghost.mjs']);
  assert.equal(d.citations.missing.length, 1);
  // The text is preserved verbatim: the reader needs to see the claim to judge it.
  assert.match(d.content, /ghost\.mjs/);
});

const { executeStep, isReadOnlyCommand } = await import('../daemon/agent/executor.mjs');

// The inspect step exists so an agent can read the repo. It is the only new
// execution surface in this change, so its boundary is pinned down hard here.
test('inspect accepts reads and refuses everything else', () => {
  for (const ok of [
    'git ls-files',
    'git ls-files | head -50',
    'git log --oneline -20 --name-only | head -120',
    'ls -la',
    'cat package.json',
    'grep -rn "worktree" daemon | head -20',
    'wc -l daemon/index.mjs',
  ]) {
    assert.equal(isReadOnlyCommand(ok), true, `should allow: ${ok}`);
  }
  for (const bad of [
    'rm -rf /',
    'git push',
    'git commit -m x',
    'git ls-files | sh',
    'git ls-files > /etc/passwd',
    'ls; rm -rf .',
    'ls && curl evil.test',
    'ls $(whoami)',
    'cat `id`',
    'echo hi > out.txt',
    'ls &',
    'ls\nrm -rf /',
    'git ls-files | head -5; rm -rf /',
    'head -1 /etc/passwd | awk "{print}"',
    'python3 -c "import os"',
    'node -e "process.exit(1)"',
    '',
    null,
  ]) {
    assert.equal(isReadOnlyCommand(bad), false, `should refuse: ${JSON.stringify(bad)}`);
  }
});

test('inspect reads real files and refuses a write at execution time', async (t) => {
  const repo = makeRepo(t, { 'tracked.txt': 'REAL CONTENT\n' });

  const run = { id: 'run-inspect', goal: 'look', output: [] };
  const ok = await executeStep(
    run,
    { type: 'inspect', name: 'ls', commands: ['git ls-files', 'cat tracked.txt'] },
    { projectRoot: repo },
  );
  assert.equal(ok.status, 'completed');
  assert.match(ok.output, /tracked\.txt/);
  assert.match(ok.output, /REAL CONTENT/);
  assert.equal(ok.meta.readOnly, true);

  // The guard is enforced again at execution time, not only by the planner.
  const before = await fs.readFile(path.join(repo, 'tracked.txt'), 'utf8');
  const bad = await executeStep(
    run,
    { type: 'inspect', name: 'evil', commands: ['rm -rf tracked.txt'] },
    { projectRoot: repo },
  );
  assert.equal(bad.status, 'failed');
  assert.match(bad.error, /not permitted/);
  assert.equal(await fs.readFile(path.join(repo, 'tracked.txt'), 'utf8'), before);
});

test('a pack run gathers real evidence before it reasons', async (t) => {
  const repo = makeRepo(t, { 'watched.txt': 'x\n' });

  const chatHandler = recordingChatHandler();
  const orchestrator = new AgentOrchestrator(repo, { chatHandler, skills: stubSkills, isolation: false });
  const packs = await loadAgentPacks();
  const created = await orchestrator.executeAgentPack({ pack: packs[0], goal: 'describe', userId: USER_ID });
  await orchestrator.executeRun(created.id, USER_ID);

  assert.equal(created.steps[0].type, 'inspect');
  const evidence = created.steps[0];
  assert.ok(evidence.commands.every((c) => isReadOnlyCommand(c)));

  // The real listing reached the model on the research turn.
  const researchTurn = chatHandler.seen[1].map((m) => m.content).join('\n');
  assert.match(researchTurn, /watched\.txt/, 'the model should see the real file listing');
});

test('a pack run uses the persona, carries skills, and persists its deliverable', async (t) => {
  const repo = makeRepo(t, { 'app.mjs': 'export const x = 1;\n' });
  const chatHandler = recordingChatHandler();
  const skills = stubSkillsWith([{ name: 'demo-skill', description: 'a demo skill', content: '# demo' }]);
  // Isolation off: this test asserts prompt content and persistence, not git.
  const orchestrator = new AgentOrchestrator(repo, { chatHandler, skills, isolation: false });

  const packs = await loadAgentPacks();
  const pack = packs.find((p) => String(p.title).toLowerCase().includes('trail')) || packs[0];

  const created = await orchestrator.executeAgentPack({ pack, goal: 'verify the handoff', userId: USER_ID });
  assert.equal(created.metadata.agentId, pack.id);
  assert.deepEqual(created.metadata.skills, ['demo-skill']);
  assert.equal(created.steps.length, 3, 'evidence, research, deliverable');

  const finished = await orchestrator.executeRun(created.id, USER_ID);
  assert.equal(finished.status, 'completed');

  // The persona and the selected skill both reached the model.
  const systemPrompts = chatHandler.seen.map((m) => m.find((x) => x.role === 'system')?.content || '');
  assert.ok(
    systemPrompts.some((s) => s.includes(pack.title)),
    'the pack persona should be a system prompt',
  );
  assert.ok(
    chatHandler.seen.some((m) => JSON.stringify(m).includes('demo-skill')),
    'the selected skill should reach the prompt',
  );

  // The deliverable survived the process boundary in the DB, not just in memory.
  const stored = dbStorage.getRunById(USER_ID, created.id);
  assert.ok(stored.metadata?.deliverable, 'the deliverable must be persisted');
  assert.equal(stored.metadata.deliverable.agentId, pack.id);
  assert.match(stored.metadata.deliverable.content, /deliverable for turn 2/);
  assert.equal(stored.metadata.deliverable.goal, 'verify the handoff');
});

test('a failed pack run records no deliverable', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-packfail-'));
  const chatHandler = {
    handleChat: async () => {
      throw new Error('provider exploded');
    },
  };
  const orchestrator = new AgentOrchestrator(repo, { chatHandler, skills: stubSkills, isolation: false });
  const packs = await loadAgentPacks();

  const created = await orchestrator.executeAgentPack({ pack: packs[0], goal: 'x', userId: USER_ID });
  const finished = await orchestrator.executeRun(created.id, USER_ID);
  assert.equal(finished.status, 'failed');
  assert.equal(dbStorage.getRunById(USER_ID, created.id).metadata?.deliverable, undefined);
});

test('ordinary runs are untouched by deliverable capture', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-plainrun-'));
  const chatHandler = recordingChatHandler();
  const orchestrator = new AgentOrchestrator(repo, { chatHandler, skills: stubSkills, isolation: false });
  const run = await orchestrator.createRun({
    goal: 'plain run',
    userId: USER_ID,
    steps: [{ type: 'prompt', name: 'say something', messages: [{ role: 'user', content: 'hi' }] }],
  });
  await orchestrator.executeRun(run.id, USER_ID);
  const stored = dbStorage.getRunById(USER_ID, run.id);
  assert.equal(stored.status, 'completed');
  assert.equal(stored.metadata?.deliverable, undefined, 'deliverables are for pack runs only');
});
