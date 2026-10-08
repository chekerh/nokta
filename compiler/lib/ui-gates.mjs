import fs from 'node:fs';
import path from 'node:path';

// Rendered-UI gates.
//
// Every gate here exists because the bug it catches actually shipped. The
// kanban board rendered with no layout at all for several releases because
// lib/planner.js emitted `.planner-col` while the stylesheet only defined
// `.kanban-col` — two names, zero overlap, and nothing noticed.
//
// These checks are static and dependency-free on purpose. A browser-based check
// would catch layout overflow too, but it costs a Playwright install and a
// booted server; the four checks below catch every defect found in the last
// audit without either.

// Only these count as a component class for the unstyled check. A bare
// `class="table"` is decorative when its styling already lives in inline
// attributes, and flagging it would be noise rather than signal. A trailing
// hyphen means the name was truncated out of a template expression, so ignore
// it too.
const COMPONENT_CLASS = /^(?=.*-)[a-z][a-z0-9-]*$|^(badge|is|has)[a-z0-9-]*$/;

// Class names owned by third-party widgets or icon fonts that ship their own CSS.
const CLASS_IGNORE = new Set(['sr-only']);

const UI_SOURCE_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.jsx', '.ts', '.tsx']);
const CSS_EXT = new Set(['.css']);
const SERVER_EXT = new Set(['.mjs']);

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function isInterpolation(value) {
  return value.includes('${') || value.includes('+') || value.includes('${');
}

function collectEmittedClasses(uiFiles, read, uiRoot) {
  const all = new Map();
  const record = (name, file) => {
    if (!name || /[-]$/.test(name) || CLASS_IGNORE.has(name)) return;
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) return;
    if (!all.has(name)) all.set(name, new Set());
    all.get(name).add(path.relative(uiRoot, file));
  };

  for (const file of uiFiles) {
    const src = read(file);

    // class="a b c" / class='a b c'
    for (const m of src.matchAll(/class\s*=\s*(["'])([^"']+)\1/g)) {
      for (const name of m[2].split(/\s+/)) record(name, file);
    }
    // className = 'a b' / className="a b"
    for (const m of src.matchAll(/className\s*=\s*(["'`])([^"'`$]+)\1/g)) {
      for (const name of m[2].split(/\s+/)) record(name, file);
    }
    // A literal class list inside a template or concatenated string literal.
    for (const m of src.matchAll(/class=\\?["']([a-z][a-z0-9 _-]*)\\?["']/g)) {
      for (const name of m[1].split(/\s+/)) record(name, file);
    }
    // classList.add('x') / .remove('x') / .toggle('x', …)
    for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(\s*['"]([a-z][a-z0-9-]*)['"]/g)) {
      record(m[1], file);
    }
    // A DOM helper that takes the class as a positional argument, e.g.
    // element('button', undefined, 'project-nav'). Without this the whole
    // workspace page looks unstyled because its classes are never in an
    // attribute.
    for (const m of src.matchAll(
      /\b(?:element|createElement|el)\(\s*['"][a-z][a-z0-9]*['"]\s*,(?:[^()]|\([^()]*\))*?,?\s*['"]([a-z][a-z0-9 _-]*)['"]\s*\)/g,
    )) {
      for (const name of m[1].split(/\s+/)) record(name, file);
    }
  }
  return all;
}

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function collectDefinedClasses(cssFiles, uiFiles, read, uiRoot) {
  const defined = new Map();
  const note = (name, file) => {
    if (!name || CLASS_IGNORE.has(name)) return;
    if (!defined.has(name)) defined.set(name, new Set());
    defined.get(name).add(path.relative(uiRoot, file));
  };

  for (const file of cssFiles) {
    // Comments carry file paths like `lib/planner.js`, which would otherwise
    // register a phantom `.js` class.
    const src = stripCssComments(read(file));
    for (const m of src.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) note(m[1], file);
  }
  for (const file of uiFiles) {
    if (!/\.html?$/.test(file)) continue;
    const src = read(file);
    for (const block of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const css = stripCssComments(block[1]);
      for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) note(m[1], file);
    }
  }
  return defined;
}

export function evaluateUiGates(target, options = {}) {
  const projectRoot = path.resolve(target);
  // Scope to the UI the server actually serves. Repo-wide scanning pulls in
  // agent-generated artifacts whose Tailwind classes would drown the signal.
  const uiRoot = path.resolve(projectRoot, options.uiDir ?? 'daemon/public');
  const serverRoot = path.resolve(projectRoot, options.serverDir ?? 'daemon');

  const read = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };

  const results = [];

  if (!fs.existsSync(uiRoot)) {
    return [
      {
        gate: 'ui.ui-present',
        status: 'fail',
        message: `No UI directory at ${path.relative(projectRoot, uiRoot)}.`,
        remediation: 'Point the gate at the served UI with { uiDir }.',
      },
    ];
  }

  const uiFiles = walk(uiRoot, UI_SOURCE_EXT);
  const cssFiles = walk(uiRoot, CSS_EXT);
  const emitted = collectEmittedClasses(uiFiles, read, uiRoot);
  const defined = collectDefinedClasses(cssFiles, uiFiles, read, uiRoot);

  const emittedFiles = new Set(uiFiles);
  const componentClasses = [...emitted.keys()].filter((name) => COMPONENT_CLASS.test(name) && emittedFiles.size > 0);

  // --- Gate 1: a class the UI renders must have a rule, or it renders unstyled.
  const unstyled = componentClasses.filter((name) => !defined.has(name)).sort();
  if (unstyled.length === 0) {
    results.push({
      gate: 'ui.class-has-style',
      status: 'pass',
      message: `All ${componentClasses.length} component classes used in markup have a CSS rule.`,
    });
  } else {
    results.push({
      gate: 'ui.class-has-style',
      status: 'fail',
      message:
        `${unstyled.length} component class(es) are rendered but have no CSS rule, so they ` +
        `display unstyled: ${unstyled.join(', ')}`,
      remediation:
        'Add a rule for each class, or drop the class attribute when the styling is already ' +
        'inline and the class carries no meaning.',
      details: { classes: unstyled.map((name) => ({ name, files: [...emitted.get(name)] })) },
    });
  }

  // --- Gate 2: an inline on* handler must resolve to a defined global.
  const definedGlobals = new Set();
  for (const file of uiFiles) {
    const src = read(file);
    for (const m of src.matchAll(
      /(?:function\s+([A-Za-z_$][\w$]*)|window\.([A-Za-z_$][\w$]*)\s*=|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g,
    )) {
      definedGlobals.add(m[1] || m[2] || m[3]);
    }
  }

  const BUILTINS = new Set([
    'if',
    'for',
    'while',
    'switch',
    'return',
    'function',
    'typeof',
    'catch',
    'do',
    'alert',
    'confirm',
    'prompt',
    'parseInt',
    'parseFloat',
    'String',
    'Number',
    'Boolean',
    'encodeURIComponent',
    'decodeURIComponent',
    'setTimeout',
    'fetch',
  ]);

  const missingHandlers = new Map();
  for (const file of uiFiles) {
    const src = read(file);
    for (const m of src.matchAll(
      /\bon(?:click|change|input|submit|load|error|focus|blur|keydown)\s*=\s*(["'])([^"']*)\1/g,
    )) {
      for (const call of m[2].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = call[1];
        if (BUILTINS.has(name) || definedGlobals.has(name)) continue;
        if (!missingHandlers.has(name)) missingHandlers.set(name, new Set());
        missingHandlers.get(name).add(path.relative(uiRoot, file));
      }
    }
  }

  if (missingHandlers.size === 0) {
    results.push({
      gate: 'ui.inline-handler-defined',
      status: 'pass',
      message: 'Every inline event handler resolves to a defined function.',
    });
  } else {
    results.push({
      gate: 'ui.inline-handler-defined',
      status: 'fail',
      message:
        `${missingHandlers.size} inline event handler(s) call a function that is never defined, ` +
        `so they throw ReferenceError when clicked: ${[...missingHandlers.keys()].join(', ')}`,
      remediation:
        'Define the function at global scope, or assign it to window when it is declared ' + 'inside an IIFE.',
      details: { handlers: [...missingHandlers].map(([name, files]) => ({ name, files: [...files] })) },
    });
  }

  // --- Gate 3: a rule for a class nothing renders is dead weight.
  // Compares against every emitted class, not just component classes.
  const deadClasses = [...defined.keys()].filter((name) => !emitted.has(name)).sort();
  if (deadClasses.length === 0) {
    results.push({
      gate: 'ui.no-dead-css',
      status: 'pass',
      message: 'No stylesheet rule targets a class the UI never renders.',
    });
  } else {
    results.push({
      gate: 'ui.no-dead-css',
      status: 'warn',
      message: `${deadClasses.length} CSS rule(s) target a class nothing renders: ${deadClasses.join(', ')}`,
      remediation:
        'Delete the rule, or the markup that should have been using it. Heuristic — a class ' +
        'built through a helper this gate cannot see will be reported here, so confirm before deleting.',
      details: { classes: deadClasses },
    });
  }

  // --- Gate: any modal must carry proper dialog semantics or screen readers
  // and focus managers can't treat it as a dialog.
  const modalIssues = [];
  for (const file of uiFiles.filter((f) => /\.html?$/.test(f))) {
    const src = read(file);
    // The opening tag may span several lines (id + style + onclick).
    for (const m of src.matchAll(/<[^>]*id="[^"]+Modal"[^>]*>/g)) {
      const open = m[0];
      const missing = [];
      if (!/role=["']dialog["']/.test(open)) missing.push('role="dialog"');
      if (!/aria-modal/.test(open)) missing.push('aria-modal="true"');
      if (missing.length) {
        const idMatch = open.match(/id="([^"]+)"/);
        modalIssues.push({ id: idMatch ? idMatch[1] : '(unknown)', file: path.relative(uiRoot, file), missing });
      }
    }
  }

  if (modalIssues.length === 0) {
    results.push({
      gate: 'ui.modal-semantics',
      status: 'pass',
      message: 'Every Modal is a proper dialog (role + aria-modal).',
    });
  } else {
    results.push({
      gate: 'ui.modal-semantics',
      status: 'fail',
      message: `${modalIssues.length} modal(s) missing dialog semantics: ${modalIssues
        .map((m) => `${m.id} (needs ${m.missing.join(', ')})`)
        .join('; ')}`,
      remediation: 'Add role="dialog" and aria-modal="true" (and an aria-label) to the modal opening tag.',
      details: { modals: modalIssues },
    });
  }

  // --- Gate 4: an API path the UI calls must be a registered route.
  const registered = new Set();
  for (const file of walk(serverRoot, SERVER_EXT)) {
    const src = read(file);
    for (const m of src.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
      registered.add(m[1].split('?')[0].replace(/\/+$/, '') || '/');
    }
  }

  const calledPaths = new Map();
  for (const file of uiFiles) {
    if (!/\.(html?|jsx?|tsx?)$/.test(file)) continue;
    const src = read(file);
    const patterns = [
      /\b(?:api|fetch)\(\s*['"][A-Z]*['"]\s*,\s*['"](\/[^'"]+)['"]/g,
      /fetch\(\s*['"`](\/api\/[^'"`]*)['"`]/g,
      /new\s+EventSource\(\s*(?:API\s*\+\s*)?['"](\/[^'"]+)['"]/g,
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const raw = m[1].split('?')[0];
        // A template-interpolated path cannot be resolved statically.
        if (isInterpolation(raw)) continue;
        const key = raw.replace(/\/+$/, '') || '/';
        if (!calledPaths.has(key)) calledPaths.set(key, new Set());
        calledPaths.get(key).add(path.relative(uiRoot, file));
      }
    }
  }

  // A concrete path matches a registered route whose params absorb segments.
  const isRouted = (called) => {
    if (registered.has(called)) return true;
    const parts = called.split('/');
    return [...registered].some((route) => {
      const routeParts = route.split('/');
      if (routeParts.length !== parts.length) return false;
      return routeParts.every((rp, i) => rp.startsWith(':') || rp === parts[i]);
    });
  };

  const unrouted = [...calledPaths.keys()].filter((p) => !isRouted(p)).sort();
  if (unrouted.length === 0) {
    results.push({
      gate: 'ui.api-route-exists',
      status: 'pass',
      message: `All ${calledPaths.size} API path(s) the UI calls are registered on the server.`,
    });
  } else {
    results.push({
      gate: 'ui.api-route-exists',
      status: 'fail',
      message:
        `${unrouted.length} API path(s) called by the UI have no matching registered route and ` +
        `will return 404: ${unrouted.join(', ')}`,
      remediation: 'Register the route in a daemon/routes/*.mjs module and call registerXRoutes(app).',
      details: { paths: unrouted.map((p) => ({ path: p, files: [...calledPaths.get(p)] })) },
    });
  }

  return results;
}
