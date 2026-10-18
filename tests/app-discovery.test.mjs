import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultRoots, discoverApps, MANIFEST_FILES } from '../daemon/lib/app-discovery.mjs';

async function fixture(files) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-discovery-')));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (content === null) await fs.mkdir(full, { recursive: true });
    else await fs.writeFile(full, content);
  }
  return root;
}

const names = result => result.candidates.map(candidate => path.relative(result.roots[0], candidate.path)).sort();

test('finds app folders by repository or manifest evidence', async t => {
  const root = await fixture({
    'portal/package.json': '{}',
    'portal/src/index.js': '',
    'legacy/.git/HEAD': 'ref: refs/heads/main',
    'rust-thing/Cargo.toml': '[package]',
    'notes/readme.md': '# just notes',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root] });
  assert.deepEqual(names(result), ['legacy', 'portal', 'rust-thing']);
  const portal = result.candidates.find(candidate => candidate.name === 'portal');
  assert.deepEqual(portal.manifests, ['package.json']);
  assert.equal(portal.hasGit, false);
  const legacy = result.candidates.find(candidate => candidate.name === 'legacy');
  assert.equal(legacy.hasGit, true);
  assert.deepEqual(legacy.manifests, []);
});

test('does not descend into a project, and skips dependency and build folders', async t => {
  const root = await fixture({
    'app/package.json': '{}',
    'app/packages/inner/package.json': '{}',
    'app/node_modules/dep/package.json': '{}',
    'node_modules/top/package.json': '{}',
    'dist/built/package.json': '{}',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root] });
  assert.deepEqual(names(result), ['app']);
});

test('respects the depth budget', async t => {
  const root = await fixture({ 'one/two/three/package.json': '{}' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.deepEqual(names(await discoverApps({ roots: [root], maxDepth: 1 })), []);
  assert.deepEqual(names(await discoverApps({ roots: [root], maxDepth: 2 })), []);
  assert.deepEqual(names(await discoverApps({ roots: [root], maxDepth: 3 })), ['one/two/three']);
});

test('never treats the scan root itself as a candidate', async t => {
  // The home directory is often a dotfiles repository; the scan must still
  // descend into it instead of reporting the root as the only app.
  const root = await fixture({ '.git/HEAD': 'ref: refs/heads/main', 'dev/app/package.json': '{}' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root] });
  assert.deepEqual(names(result), ['dev/app']);
});

test('stops at the limit', async t => {
  const files = {};
  for (let index = 0; index < 6; index += 1) files[`app-${index}/package.json`] = '{}';
  const root = await fixture(files);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root], limit: 3 });
  assert.equal(result.candidates.length, 3);
});

test('reads roots from the environment, splitting on commas', () => {
  assert.deepEqual(defaultRoots({ NOKTA_DISCOVERY_ROOTS: '/one, /two ' }), ['/one', '/two']);
  assert.deepEqual(defaultRoots({ HOME: '/home/me' }), ['/home/me']);
});

test('resolves a symlinked root so its paths match a stored project root', async t => {
  const root = await fixture({ 'app/package.json': '{}' });
  const linkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-discovery-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(linkRoot, { recursive: true, force: true }));
  const link = path.join(linkRoot, 'link');
  try {
    await fs.symlink(root, link, 'dir');
  } catch {
    t.skip('symlinks unavailable');
    return;
  }
  const result = await discoverApps({ roots: [link] });
  assert.equal(result.candidates[0].path, path.join(root, 'app'));
});

test('manifest list covers the common language entry points', () => {
  for (const file of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'pom.xml']) {
    assert.ok(MANIFEST_FILES.has(file), `${file} should mark an app folder`);
  }
});
