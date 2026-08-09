import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateTrailGates, hasGateFailures } from '../compiler/lib/nokta.mjs';

function makeFixture(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nokta-gates-${name}-`));
}

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function completeSession(validation = 'npm test passed.', handoff = 'Ready for the next agent.') {
  return `# Trail Session: test

## Objective

Ship a tested change.

## Current Phase

Handoff

## Scope And Constraints

- In scope: test fixture.

## Loaded Context Packs

- core.agent-operating-system

## Evidence Read

- README.md

## Commands Run And Outcomes

- npm test: passed.

## Decisions Made

- Use the smallest fixture.

## What Worked

- Gate checks passed.

## What Failed

- Nothing.

## Risks And Blockers

- None.

## Validation Status

${validation}

## Next Action

Continue with implementation.

## Handoff Summary

${handoff}
`;
}

test('evaluateTrailGates fails when trail index is missing', () => {
  const root = makeFixture('missing');
  const results = evaluateTrailGates(root);

  assert.equal(hasGateFailures(results), true);
  assert.equal(results[0].gate, 'trail.index');
});

test('evaluateTrailGates passes for a complete trail', () => {
  const root = makeFixture('complete');
  writeFile(root, '.ai/trail/index.md', 'Active session: `.ai/trail/sessions/session.md`\n');
  writeFile(root, '.ai/trail/sessions/session.md', completeSession());

  const results = evaluateTrailGates(root);

  assert.equal(hasGateFailures(results), false);
  assert.ok(results.some((result) => result.gate === 'verification.status' && result.status === 'pass'));
  assert.ok(results.some((result) => result.gate === 'handoff.summary' && result.status === 'pass'));
});

test('evaluateTrailGates fails unfinished validation and handoff', () => {
  const root = makeFixture('unfinished');
  writeFile(root, '.ai/trail/index.md', 'Active session: `.ai/trail/sessions/session.md`\n');
  writeFile(root, '.ai/trail/sessions/session.md', completeSession('Not run yet.', 'Implementation in progress.'));

  const results = evaluateTrailGates(root);

  assert.equal(hasGateFailures(results), true);
  assert.ok(results.some((result) => result.gate === 'verification.status' && result.status === 'fail'));
  assert.ok(results.some((result) => result.gate === 'handoff.summary' && result.status === 'fail'));
});
