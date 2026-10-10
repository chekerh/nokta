import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateUiGates } from '../compiler/lib/ui-gates.mjs';

// The kanban board shipped with no layout at all: lib/planner.js emitted
// `.planner-col` while the stylesheet only defined `.kanban-col`. Every gate in
// this file exists to make that class of defect impossible to merge again.

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nokta-ui-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function run(root) {
  const results = evaluateUiGates(root);
  const byGate = Object.fromEntries(results.map((r) => [r.gate, r]));
  return { results, byGate, failed: results.some((r) => r.status === 'fail') };
}

const HEALTHY = {
  'daemon/routes/planner.mjs': `
    export function registerPlannerRoutes(app, sprintEngine) {
      app.get('/api/v1/planner/items', asyncHandler(handler));
    }
  `,
  'daemon/public/index.html': `
    <style>
      .planner-board { display: flex; }
      .planner-col { min-width: 220px; }
      .badge-red { color: red; }
    </style>
    <div class="planner-board"><div class="planner-col"></div></div>
    <span class="badge-red"></span>
    <script>
      function refreshBoard() {}
      api('GET', '/api/v1/planner/items');
    </script>
  `,
};

test('healthy UI passes every gate', () => {
  const { byGate, failed } = run(fixture(HEALTHY));
  assert.equal(failed, false, JSON.stringify(byGate['ui.class-has-style'], null, 2));
  for (const gate of ['ui.class-has-style', 'ui.inline-handler-defined', 'ui.no-dead-css', 'ui.api-route-exists']) {
    assert.equal(byGate[gate].status, 'pass', `${gate}: ${byGate[gate].message}`);
  }
});

test('the original kanban bug is caught: markup emits a class with no CSS rule', () => {
  // planner.js emitted .planner-col; the stylesheet only defined .kanban-col.
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'].replace(
      '.planner-col { min-width: 220px; }',
      '.kanban-col { min-width: 220px; }',
    ),
  });
  const { byGate, failed } = run(root);
  assert.equal(failed, true);
  assert.equal(byGate['ui.class-has-style'].status, 'fail');
  assert.match(byGate['ui.class-has-style'].message, /planner-col/);
});

test('an inline handler calling an undefined function fails', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': HEALTHY['daemon/public/index.html']
      .replace('function refreshBoard() {}', '')
      .replace('<div class="planner-board">', '<div class="planner-board" onclick="refreshBoard()">'),
  });
  const { byGate } = run(root);
  assert.equal(byGate['ui.inline-handler-defined'].status, 'fail');
  assert.match(byGate['ui.inline-handler-defined'].message, /refreshBoard/);
});

test('a UI call to an unregistered API path fails', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/routes/planner.mjs': "app.get('/api/v1/planner/summary', handler);",
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'].replace(
      '/api/v1/planner/items',
      '/api/v1/planner/nonexistent',
    ),
  });
  const { byGate } = run(root);
  assert.equal(byGate['ui.api-route-exists'].status, 'fail');
  assert.match(byGate['ui.api-route-exists'].message, /planner\/nonexistent/);
});

test('a registered route with a parameter still matches a concrete call', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/routes/planner.mjs': "app.get('/api/v1/planner/items/:id', handler);",
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'].replace(
      '/api/v1/planner/items',
      '/api/v1/planner/items/42',
    ),
  });
  const { byGate } = run(root);
  assert.equal(byGate['ui.api-route-exists'].status, 'pass');
});

test('dead CSS is reported as a warning, not a failure', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'].replace(
      '.badge-red { color: red; }',
      '.badge-red { color: red; }\n.legacy-column { width: 10px; }',
    ),
  });
  const { byGate, failed } = run(root);
  assert.equal(byGate['ui.no-dead-css'].status, 'warn');
  assert.match(byGate['ui.no-dead-css'].message, /legacy-column/);
  assert.equal(failed, false, 'a heuristic warning must not block');
});

test('a class name mentioned only inside a CSS comment is not treated as styled', () => {
  // A comment naming lib/planner.js must not register a phantom .js class.
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': '<style>/* emitted by lib/planner.js */ .planner-col{}</style>',
  });
  const { byGate } = run(root);
  assert.ok(!byGate['ui.no-dead-css'].message.includes(' .js'), byGate['ui.no-dead-css'].message);
});

test('a class passed positionally to a DOM helper counts as emitted', () => {
  const root = fixture({
    'daemon/public/lib/workspace.css': '.column{width:10px}\n.task{height:2px}',
    'daemon/public/workspace.html': '<script type="module" src="/lib/workspace.js"></script>',
    'daemon/public/lib/workspace.js': `
      const el = element('section', undefined, 'column');
      const b = element('button', undefined, 'task');
    `,
  });
  const { byGate } = run(root);
  assert.equal(byGate['ui.no-dead-css'].status, 'pass', byGate['ui.no-dead-css'].message);
});

test('a modal missing role="dialog" fails ui.modal-semantics', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'].replace(
      '<style>',
      '<style>', // keep styles
    )+'\n<div id="BrainstormModal" style="display:none"></div>',
  });
  const { byGate, failed } = run(root);
  assert.equal(failed, true);
  assert.equal(byGate['ui.modal-semantics'].status, 'fail');
  assert.match(byGate['ui.modal-semantics'].message, /BrainstormModal/);
});

test('a modal with proper dialog semantics passes ui.modal-semantics', () => {
  const root = fixture({
    ...HEALTHY,
    'daemon/public/index.html': HEALTHY['daemon/public/index.html'] +
      '\n<div id="BrainstormModal" role="dialog" aria-modal="true" aria-label="Brainstorm"></div>',
  });
  const { byGate } = run(root);
  assert.equal(byGate['ui.modal-semantics'].status, 'pass');
});

test('a missing UI directory fails loudly instead of passing silently', () => {
  const { byGate } = run(fixture({ 'daemon/routes/x.mjs': '' }));
  assert.equal(byGate['ui.ui-present'].status, 'fail');
});

test('this repository itself passes every gate', () => {
  const { byGate, failed } = run(process.cwd());
  assert.equal(
    failed,
    false,
    `repo gates failing: ${JSON.stringify(
      Object.values(byGate)
        .filter((g) => g.status === 'fail')
        .map((g) => `${g.gate}: ${g.message}`),
      null,
      2,
    )}`,
  );
});
