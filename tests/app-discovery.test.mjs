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
  assert.equal(result.truncated, false, 'a walk that finished is not partial');
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

test('reports a configured root that is itself an app, and nested roots once', async t => {
  const root = await fixture({ 'outer/inner/package.json': '{}', 'outer/inner/vendor/deep/package.json': '{}' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outer = path.join(root, 'outer');
  const inner = path.join(root, 'outer', 'inner');
  const inside = result => result.candidates.map(candidate => candidate.path);

  // A root the user pointed at is the app they asked for, and a matched root
  // is not descended into any more than a matched folder is.
  assert.deepEqual(inside(await discoverApps({ roots: [inner], includeRoots: true })), [inner]);
  assert.deepEqual(inside(await discoverApps({ roots: [outer], includeRoots: true })), [inner]);
  // Without includeRoots a root is only a place to search — the implicit home
  // directory is frequently a dotfiles repository and must still be walked.
  assert.deepEqual(inside(await discoverApps({ roots: [inner] })), []);
  // Overlapping roots report the app once, in either order.
  assert.deepEqual(inside(await discoverApps({ roots: [outer, inner], includeRoots: true })), [inner]);
  assert.deepEqual(inside(await discoverApps({ roots: [inner, outer], includeRoots: true })), [inner]);
});

test('stops at the limit', async t => {
  const files = {};
  for (let index = 0; index < 6; index += 1) files[`app-${index}/package.json`] = '{}';
  const root = await fixture(files);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root], limit: 3 });
  assert.equal(result.candidates.length, 3);
  assert.equal(result.truncated, true, 'a capped list must say it is partial');
});

test('stops early on the directory budget and reports how far it got', async t => {
  const files = {};
  for (let index = 0; index < 8; index += 1) files[`dir-${index}/package.json`] = '{}';
  const root = await fixture(files);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await discoverApps({ roots: [root], maxDirs: 3 });
  // The root plus two children fit in the budget; the other six are unseen.
  assert.equal(result.scanned, 3);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.truncated, true);
});

test('never follows a symlink, so a loop in the tree cannot trap the walk', async t => {
  const root = await fixture({ 'app/package.json': '{}', 'plain/readme.md': '' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  try {
    await fs.symlink(root, path.join(root, 'plain', 'loop'), 'dir');
  } catch {
    t.skip('symlinks unavailable');
    return;
  }
  const result = await discoverApps({ roots: [root], maxDirs: 50 });
  assert.deepEqual(names(result), ['app']);
});

test('skips a folder it cannot read instead of failing the scan', async t => {
  const root = await fixture({ 'open/package.json': '{}', 'locked/package.json': '{}' });
  const locked = path.join(root, 'locked');
  t.after(async () => { await fs.chmod(locked, 0o700).catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('root can read anything');
    return;
  }
  await fs.chmod(locked, 0o000);
  const result = await discoverApps({ roots: [root] });
  assert.deepEqual(names(result), ['open']);
});

test('reads roots from the environment, splitting on commas', () => {
  assert.deepEqual(defaultRoots({ NOKTA_APP_DISCOVERY_ROOTS: '/one, /two ' }), ['/one', '/two']);
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
