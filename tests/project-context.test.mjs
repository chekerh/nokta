import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { buildProjectContext, renderProjectContext, clearProjectContextCache } =
  await import('../daemon/agent/project-context.mjs');

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-ctx-'));
  t.after(async () => {
    clearProjectContextCache();
    await fs.rm(root, { recursive: true, force: true });
  });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
  clearProjectContextCache();
  return root;
}

test('detects the real stack instead of assuming one', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({
      name: 'demo',
      type: 'module',
      scripts: { test: 'node --test', lint: 'eslint .' },
    }),
    'daemon/server.mjs': 'export const x = 1;',
    'tests/a.test.mjs': 'test("x", () => {});',
  });

  const ctx = await buildProjectContext(root);
  assert.equal(ctx.stack, '.mjs');
  assert.equal(ctx.packageName, 'demo');
  assert.equal(ctx.moduleType, 'module');
  assert.equal(ctx.testCommand, 'test');
  assert.equal(ctx.lintCommand, 'lint');
  assert.deepEqual(ctx.topLevel.sort(), ['daemon/', 'package.json', 'tests/']);
  assert.ok(ctx.entrypoints.includes(path.join('daemon', 'server.mjs')));
  assert.ok(ctx.testFiles.includes(path.join('tests', 'a.test.mjs')));
});

test('typescript project reports .ts as the stack', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({ name: 'ts-app' }),
    'src/index.ts': 'export {};',
    'src/util.ts': 'export {};',
  });
  const ctx = await buildProjectContext(root);
  assert.equal(ctx.stack, '.ts');
});

test('skips dependency and build directories', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({ name: 'demo' }),
    'src/app.mjs': 'export {};',
    'node_modules/pkg/index.js': 'module.exports = {}',
    'dist/bundle.mjs': 'built',
  });
  const ctx = await buildProjectContext(root);
  assert.ok(!ctx.sampleFiles.some((f) => f.includes('node_modules')));
  assert.ok(!ctx.sampleFiles.some((f) => f.includes('dist')));
  assert.equal(ctx.stack, '.mjs');
});

test('renders the path rules the planner needs', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }),
    'src/app.mjs': 'export {};',
  });
  const text = renderProjectContext(await buildProjectContext(root));
  assert.match(text, /Never invent a stack/);
  assert.match(text, /app\.mjs/);
  assert.match(text, /npm run test/);
});

test('a missing directory yields an empty context rather than throwing', async () => {
  clearProjectContextCache();
  const ctx = await buildProjectContext(path.join(os.tmpdir(), 'nokta-does-not-exist-xyz'));
  assert.equal(ctx.topLevel.length, 0);
  assert.equal(ctx.stack, null);
  assert.equal(renderProjectContext(ctx).includes('unknown'), true);
});

test('context is cached between calls', async (t) => {
  const root = await fixture(t, { 'package.json': JSON.stringify({ name: 'demo' }), 'a.mjs': 'export {};' });
  const first = await buildProjectContext(root);
  await fs.writeFile(path.join(root, 'later.mjs'), 'export {};', 'utf8');
  const second = await buildProjectContext(root);
  assert.equal(first, second, 'expected the cached object to be returned');
  assert.ok(!second.sampleFiles.includes('later.mjs'), 'cache should not re-walk');
});
