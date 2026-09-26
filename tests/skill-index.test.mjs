import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildIndex, discoverSkills, parseFrontmatter, EXCLUDED_SOURCES } from '../daemon/workspace/skill-index.mjs';

function skill(name, description = 'a test skill', extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n${extra}\n`;
}

async function fixtureTree() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-skillindex-'));
  const write = async (rel, content) => {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  await write('real/SKILL.md', skill('real-skill', 'the canonical copy'));
  await write('real/references/notes.md', '# notes');

  // Same name, mirrored into a harness directory: the mirror must lose.
  await write('.claude/skills/real-skill/SKILL.md', skill('real-skill', 'the canonical copy'));
  // Same name, different content: a real conflict worth scoring.
  await write('.cursor/skills/real-skill/SKILL.md', skill('real-skill', 'a drifted stale copy'));

  // A scratch note with no frontmatter at all.
  await write('notes/SKILL.md', '# ECC Project Knowledge Graph\n\nhardcoded to /Users/mac/ecc.\n');
  // A template stub missing its description.
  await write('template/SKILL.md', '---\nname: template-stub\n---\n\n# stub\n');

  // Known-malicious fixture shapes, modelled on the SkillSpector corpus.
  // "poison" and "poison-tool" sit OUTSIDE any test directory on purpose, so
  // the path rules alone would not stop them.
  await write('scanner/tests/fixtures/malicious_skill/SKILL.md', skill('malicious-skill', 'cooking help'));
  await write('other/fixtures/poison/SKILL.md', skill('poison', 'clean looking'));
  await write('other/mcp_poisoned_tool/SKILL.md', skill('poison-tool', 'clean looking'));
  // A fixture name that escaped its test directory, plus a homoglyph name.
  await write('other/loose/personal-assistant/SKILL.md', skill('personal-assistant', 'remembers you'));
  await write('other/loose/unicode/SKILL.md', skill('reаd_data', 'reads a file'));
  // Overprivileged but perfectly well-formed: only the collection rule stops it.
  await write('eigent/resources/example-skills/docx/SKILL.md', skill('docx', 'documents'));
  await write('iai-personal-memory-engine/src/SKILL.md', skill('pme', 'memory'));

  return root;
}

test('parseFrontmatter reads name and description', () => {
  const meta = parseFrontmatter(skill('alpha', 'does alpha things'));
  assert.equal(meta.name, 'alpha');
  assert.equal(meta.description, 'does alpha things');
});

test('parseFrontmatter returns null when the file has no frontmatter', () => {
  assert.equal(parseFrontmatter('# just a heading\n\nbody'), null);
});

test('parseFrontmatter strips surrounding quotes from values', () => {
  const meta = parseFrontmatter('---\nname: "beta"\ndescription: \'quoted text\'\n---\n');
  assert.equal(meta.name, 'beta');
  assert.equal(meta.description, 'quoted text');
});

test('discoverSkills indexes a skill that has valid frontmatter', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills } = await discoverSkills(root);
  assert.ok(skills.some((s) => s.name === 'real-skill'));
});

test('discoverSkills rejects a scratch note with no frontmatter', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills, stats } = await discoverSkills(root);
  assert.equal(skills.length, 1);
  assert.equal(stats.noFrontmatter, 1);
});

test('discoverSkills rejects a stub that has no description', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills, stats } = await discoverSkills(root);
  assert.equal(stats.noDescription, 1);
  assert.equal(skills.some((s) => s.name === 'template-stub'), false);
});

test('discoverSkills never indexes test or fixture directories', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills } = await discoverSkills(root);
  const names = skills.map((s) => s.name);
  assert.deepEqual(names.filter((n) => ['malicious-skill', 'poison', 'poison-tool'].includes(n)), []);
});

test('discoverSkills blocks known malicious fixture names outside any test directory', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills, stats } = await discoverSkills(root);
  assert.equal(
    skills.some((s) => s.name === 'personal-assistant'),
    false,
    'a named attack fixture must stay out even outside tests/',
  );
  assert.equal(stats.blockedName, 1);
});

test('discoverSkills rejects a homoglyph skill name used to evade a name allowlist', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills, stats } = await discoverSkills(root);
  const homoglyph = skills.find((s) => s.name.includes('а'));
  assert.equal(homoglyph, undefined, 'Cyrillic lookalike name must not be indexed');
  assert.equal(stats.homoglyph, 1);
});

test('discoverSkills excludes whole collections listed in EXCLUDED_SOURCES', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills, sourceExcluded } = await discoverSkills(root);
  const names = skills.map((s) => s.name);
  assert.equal(names.includes('docx'), false, 'eigent forks must stay out');
  assert.equal(names.includes('pme'), false, 'memory engine must stay out');
  const reasons = sourceExcluded.filter((e) => EXCLUDED_SOURCES[path.basename(e.path)]);
  assert.equal(reasons.length, 2);
});

test('discoverSkills keeps the canonical copy over a drifted same-name copy', async (t) => {
  const root = await fixtureTree();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { skills } = await discoverSkills(root);
  const real = skills.find((s) => s.name === 'real-skill');
  assert.equal(real.description, 'the canonical copy');
  assert.equal(real.file, path.join(root, 'real', 'SKILL.md'));
});

test('buildIndex writes a tree Nokta can walk and reports its work', async (t) => {
  const source = await fixtureTree();
  const index = path.join(source, '..', `nokta-index-${path.basename(source)}`);
  t.after(async () => {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(index, { recursive: true, force: true });
  });

  const result = await buildIndex({ sourceRoot: source, indexRoot: index });
  assert.equal(result.unique, 1);
  assert.equal(result.placements.length, 1);
  assert.deepEqual(result.collisions, []);

  // The walker only descends SKILL.md files, so the placement must resolve.
  const walked = await discoverSkills(index);
  assert.equal(walked.skills.length, 1);
  assert.equal(walked.skills[0].name, 'real-skill');
});

test('buildIndex dry run writes nothing', async (t) => {
  const source = await fixtureTree();
  const index = path.join(source, '..', `nokta-dry-${path.basename(source)}`);
  t.after(async () => {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(index, { recursive: true, force: true });
  });

  const result = await buildIndex({ sourceRoot: source, indexRoot: index, dryRun: true });
  assert.equal(result.placements.length, 1);
  await assert.rejects(fs.access(index), /ENOENT/);
});
