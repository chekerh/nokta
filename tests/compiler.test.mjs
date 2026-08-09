import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compileContext, detectProject, loadPacks, selectPacks } from '../compiler/lib/nokta.mjs';

function makeFixture(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nokta-${name}-`));
}

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

test('loadPacks validates and loads Nokta packs', () => {
  const packs = loadPacks();
  const packIds = packs.map((pack) => pack.id);

  assert.ok(packIds.includes('core.agent-operating-system'));
  assert.ok(packIds.includes('core.trail-discipline'));
  assert.ok(packIds.includes('token.context-budget'));
  assert.ok(packIds.includes('senior.security'));
  assert.ok(packs.every((pack) => Number.isInteger(pack.tokenCost)));
});

test('detectProject identifies TypeScript React projects', () => {
  const root = makeFixture('react');
  writeFile(
    root,
    'package.json',
    JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        vite: '^7.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    }),
  );
  writeFile(root, 'tsconfig.json', '{}');
  writeFile(root, 'src/App.tsx', 'export function App() { return null; }\n');

  const detected = detectProject(root);

  assert.ok(detected.stacks.includes('typescript'));
  assert.ok(detected.stacks.includes('react'));
  assert.ok(detected.stacks.includes('vite'));
  assert.ok(detected.stacks.includes('frontend'));
  assert.ok(detected.packageManagers.includes('npm'));
});

test('selectPacks keeps required packs and selects relevant stack packs', () => {
  const root = makeFixture('selection');
  writeFile(
    root,
    'package.json',
    JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        next: '^15.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    }),
  );
  writeFile(root, 'app/page.tsx', 'export default function Page() { return null; }\n');

  const packs = loadPacks();
  const detected = detectProject(root);
  const selection = selectPacks({
    packs,
    detected,
    task: 'build accessible React UI and add tests',
    budget: 5000,
  });
  const ids = selection.selected.map(({ pack }) => pack.id);

  assert.ok(ids.includes('core.agent-operating-system'));
  assert.ok(ids.includes('core.trail-discipline'));
  assert.ok(ids.includes('token.context-budget'));
  assert.ok(ids.includes('stack.typescript'));
  assert.ok(ids.includes('stack.react-next'));
  assert.ok(ids.includes('senior.ux-frontend'));
  assert.ok(selection.usedBudget <= 5000);
});

test('compileContext renders compact adapter-specific context', () => {
  const root = makeFixture('compile');
  writeFile(root, 'package.json', JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }));
  writeFile(root, 'src/index.ts', 'export const value = 1;\n');

  const result = compileContext({
    target: root,
    adapter: 'codex',
    task: 'fix TypeScript test failure',
    budget: 3000,
  });

  assert.equal(result.metadata.adapter, 'codex');
  assert.ok(result.metadata.detected.stacks.includes('typescript'));
  assert.ok(result.markdown.includes('Nokta Compiled Context'));
  assert.ok(result.markdown.includes('core.trail-discipline'));
  assert.ok(result.markdown.includes('stack.typescript'));
  assert.ok(result.markdown.includes('Do not expose hidden chain-of-thought'));
});
