import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScopeEnforcer } from '../daemon/lib/scope-enforcer.mjs';

// The enforcer is the last line of defence between a model and the repository.
// It previously failed open in three separate ways, and a run without a `scope`
// step had no enforcer at all, so every edit was unrestricted. A run that
// rewrote daemon/server.mjs from 256 lines to 7 was allowed through.
//
// The rule now: an allow-list that lists nothing allows nothing.

test('a run with no declared scope cannot mutate anything', () => {
  const enforcer = new ScopeEnforcer();
  const check = enforcer.validateMutation('run-1', { file: 'daemon/server.mjs', operation: 'edit' });
  assert.equal(check.allowed, false, 'absent scope must deny, not allow');
  assert.match(check.reason, /no scope/i);
});

test('a scope that declares no targets cannot mutate anything', () => {
  const enforcer = new ScopeEnforcer();
  // This is what the planner used to emit: `scope` documented as needing no
  // fields, which produced empty allow-lists that meant "unrestricted".
  enforcer.declareScope('run-1', {});
  const check = enforcer.validateMutation('run-1', { file: 'daemon/server.mjs', operation: 'edit' });
  assert.equal(check.allowed, false);
  assert.match(check.reason, /no allowed/i);
});

test('a declared scope allows only the files it names', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/server.mjs'] });

  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/server.mjs' }).allowed, true);
  const denied = enforcer.validateMutation('run-1', { file: 'daemon/index.mjs' });
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /not in allowed list/i);
});

test('a declared scope allows only the directories it names', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedDirs: ['daemon/'] });

  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/server.mjs' }).allowed, true);
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/agent/executor.mjs' }).allowed, true);
  assert.equal(enforcer.validateMutation('run-1', { file: 'agents/trailkeeper.agent.json' }).allowed, false);
});

test('an allow-list is a ceiling, not a suggestion: a directory scope still refuses a blocked dir', () => {
  const enforcer = new ScopeEnforcer();
  // Broad permission is allowed to be requested; it is still not allowed to
  // reach .git, node_modules or .env, which stay blocked at every level.
  enforcer.declareScope('run-1', { allowedDirs: ['.'] });
  for (const file of ['.git/config', 'node_modules/x/index.js', '.env']) {
    const check = enforcer.validateMutation('run-1', { file });
    assert.equal(check.allowed, false, `${file} must stay blocked`);
  }
});

test('blocked files win over an allow-list', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/server.mjs'], blockedFiles: ['daemon/server.mjs'] });
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/server.mjs' }).allowed, false);
});

test('change limits are enforced against recorded mutations', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedDirs: ['daemon/'], maxFilesChanged: 2 });

  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/a.mjs' }).allowed, true);
  enforcer.recordMutation('run-1', { file: 'daemon/a.mjs' });
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/b.mjs' }).allowed, true);
  enforcer.recordMutation('run-1', { file: 'daemon/b.mjs' });

  const third = enforcer.validateMutation('run-1', { file: 'daemon/c.mjs' });
  assert.equal(third.allowed, false);
  assert.match(third.reason, /max files changed/i);
});

test('change limits are cumulative across lines, not per file', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedDirs: ['daemon/'], maxLinesChanged: 100 });

  enforcer.recordMutation('run-1', { file: 'daemon/a.mjs', linesChanged: 80 });
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/b.mjs', linesChanged: 10 }).allowed, true);
  const over = enforcer.validateMutation('run-1', { file: 'daemon/b.mjs', linesChanged: 30 });
  assert.equal(over.allowed, false);
  assert.match(over.reason, /max lines changed/i);
});

test('scopes are isolated per run', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/server.mjs'] });
  assert.equal(enforcer.validateMutation('run-2', { file: 'daemon/server.mjs' }).allowed, false);
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/server.mjs' }).allowed, true);
});

test('a pattern is matched literally, except for the * and ? wildcards', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/agent/*.mjs'] });

  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/agent/executor.mjs' }).allowed, true);
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/lib/scope-enforcer.mjs' }).allowed, false);

  // A dot must not behave as "any character": a naive RegExp built from the raw
  // pattern would let `daemon/xserver.mjs` through `daemon/server.mjs`.
  enforcer.declareScope('run-2', { allowedFiles: ['docs/DELIVERY_PLAN.md'] });
  assert.equal(enforcer.validateMutation('run-2', { file: 'docs/XELIVERY_XLAN.md' }).allowed, false);
  assert.equal(enforcer.validateMutation('run-2', { file: 'docs/DELIVERY_PLAN.md' }).allowed, true);
});

test('a pattern that is not a valid regex does not throw', () => {
  const enforcer = new ScopeEnforcer();
  // Unescaped, this was interpolated straight into a RegExp and threw a
  // SyntaxError, which surfaced as a confusing execution failure.
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/a(b[.mjs'] });
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/a(b[.mjs' }).allowed, true);
  assert.equal(enforcer.validateMutation('run-1', { file: 'daemon/axb.mjs' }).allowed, false);
});

test('the scope report reflects the declared scope and the mutations', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['daemon/server.mjs'] });
  enforcer.recordMutation('run-1', { file: 'daemon/server.mjs', linesChanged: 5, withinScope: true });

  const report = enforcer.getScopeReport('run-1');
  assert.equal(report.mutations, 1);
  assert.deepEqual(report.filesChanged, ['daemon/server.mjs']);
  assert.equal(report.withinLimits, true);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.scope.allowedFiles, ['daemon/server.mjs']);
});

test('cleanup drops both the scope and the mutation history', () => {
  const enforcer = new ScopeEnforcer();
  enforcer.declareScope('run-1', { allowedFiles: ['a.mjs'] });
  enforcer.recordMutation('run-1', { file: 'a.mjs' });
  enforcer.cleanup('run-1');
  assert.equal(enforcer.activeScopes.has('run-1'), false);
  assert.equal(enforcer.getMutations('run-1').length, 0);
});
