import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseFrontmatter, extractItems, convertAll } from '../scripts/convert-agency-agents.mjs';

const DIVISIONS = {
  divisions: {
    engineering: { label: 'Engineering', icon: 'Code', color: '#3B82F6' },
    strategy: { label: 'Strategy', icon: 'Target', color: '#111111' },
  },
};

function persona(name, description, extra = '') {
  return `---
name: ${name}
description: ${description}
color: indigo
emoji: 🏛️
vibe: ${extra || 'A short vibe.'}
---

# ${name} Agent

You are **${name}**.

## 🎯 Your Core Mission

- Ship the first useful slice
- Keep the loop tight

## 🔧 Critical Rules You Must Follow

- Never invent a result
- Always state the evidence

## 📋 Your Technical Deliverables

- A written plan
- A passing test
`;
}

async function tree() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-agency-'));
  await fs.writeFile(path.join(root, 'divisions.json'), JSON.stringify(DIVISIONS));
  await fs.mkdir(path.join(root, 'engineering'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'engineering', 'engineering-software-architect.md'),
    persona('Software Architect', 'Expert software architect.'),
  );
  // A division the source itself excludes as non-division.
  await fs.mkdir(path.join(root, 'strategy'), { recursive: true });
  await fs.writeFile(path.join(root, 'strategy', 'playbook.md'), persona('Playbook', 'No agent here.'));
  // A file with no frontmatter at all.
  await fs.writeFile(path.join(root, 'engineering', 'engineering-broken.md'), '# just a doc\n');
  return root;
}

test('parseFrontmatter reads persona metadata', () => {
  const meta = parseFrontmatter(persona('Architect', 'Does architecture.'));
  assert.equal(meta.name, 'Architect');
  assert.equal(meta.description, 'Does architecture.');
  assert.equal(meta.emoji, '🏛️');
});

test('parseFrontmatter returns null without frontmatter', () => {
  assert.equal(parseFrontmatter('# no frontmatter\n'), null);
});

test('extractItems pulls a bulleted list from a matching heading', () => {
  const body = persona('Architect', 'x').split('\n---\n').pop();
  const rules = extractItems(body, [/critical\s+rules/i]);
  assert.deepEqual(rules, ['Never invent a result', 'Always state the evidence']);
});

test('convertAll skips non-division directories and files without frontmatter', async (t) => {
  const src = await tree();
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-agency-out-'));
  t.after(async () => {
    await fs.rm(src, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  const { written, skipped } = await convertAll({ sourceRoot: src, outDir: out });

  assert.deepEqual(
    written.map((w) => w.file),
    ['engineering-software-architect.agent.json'],
  );
  assert.equal(
    skipped.some((s) => s.file.includes('broken')),
    true,
    'frontmatter-less file should be skipped',
  );
  assert.equal(
    written.some((w) => w.division === 'strategy'),
    false,
    'strategy/ is not a source-agent division',
  );
});

test('converted agent carries the persona body as instructions', async (t) => {
  const src = await tree();
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-agency-out-'));
  t.after(async () => {
    await fs.rm(src, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  await convertAll({ sourceRoot: src, outDir: out });
  const agent = JSON.parse(
    await fs.readFile(path.join(out, 'engineering-software-architect.agent.json'), 'utf8'),
  );

  assert.equal(agent.id, 'agent.engineering.software-architect');
  assert.equal(agent.title, 'Software Architect');
  assert.equal(agent.divisionLabel, 'Engineering');
  assert.match(agent.instructions, /You are \*\*Software Architect\*\*/);
  assert.deepEqual(agent.scope, ['Ship the first useful slice', 'Keep the loop tight']);
  assert.deepEqual(agent.criticalRules, ['Never invent a result', 'Always state the evidence']);
  assert.deepEqual(agent.outputs, ['A written plan', 'A passing test']);
  // cannotDo carries prohibitions only; "Always state the evidence" is a
  // positive obligation and would be inverted by that field.
  assert.deepEqual(agent.cannotDo, ['Never invent a result']);
  // The source states no input or handoff contract, so those stay empty
  // rather than being filled with a plausible-sounding invention.
  assert.deepEqual(agent.inputs, []);
  assert.deepEqual(agent.handoff, []);
});

test('extractItems still returns items when a later heading does not match', () => {
  // Regression: a matcher that tracked only the *last* heading returned []
  // whenever a matching section was followed by any other section, which
  // silently emptied scope/outputs for most real personas.
  const body = [
    '## 🎯 Your Core Mission',
    '',
    '1. **Domain modeling** — bounded contexts',
    '2. **Patterns** — event sourcing',
    '',
    '## 🗣️ Your Communication Style',
    '',
    'Be brief. Never over-explain.',
  ].join('\n');

  const scope = extractItems(body, [/core\s+mission/i]);
  assert.deepEqual(scope, ['Domain modeling — bounded contexts', 'Patterns — event sourcing']);
});

test('extractItems falls back to prose when a section has no list', () => {
  const body = [
    '## 🎯 Your Core Mission',
    '',
    'You are accountable for delivery risk. You own the plan.',
    '',
    '## 🗣️ Your Communication Style',
    '',
    'Irrelevant prose that must not leak in.',
  ].join('\n');

  const scope = extractItems(body, [/core\s+mission/i]);
  assert.deepEqual(scope, [
    'You are accountable for delivery risk.',
    'You own the plan.',
  ]);
});

test('convertAll never overwrites an existing agent file', async (t) => {
  const src = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-agency-'));
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-agency-out-'));
  t.after(async () => {
    await fs.rm(src, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(src, 'divisions.json'),
    JSON.stringify({ divisions: { engineering: { label: 'Engineering', icon: 'Code', color: '#1' } } }),
  );
  await fs.mkdir(path.join(src, 'engineering'), { recursive: true });
  await fs.writeFile(path.join(src, 'engineering', 'engineering-planner.md'), persona('Planner', 'A persona.'));
  await fs.writeFile(path.join(out, 'engineering-planner.agent.json'), '{"id":"agent.planner"}\n');

  const { written, skipped } = await convertAll({ sourceRoot: src, outDir: out });

  assert.equal(written.length, 0, 'must not write over an existing agent');
  assert.equal(skipped[0].reason.includes('already exists'), true);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(out, 'engineering-planner.agent.json'), 'utf8')).id,
    'agent.planner',
    'existing Nokta agent must be untouched',
  );
});
