import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentOrchestrator } from '../daemon/agent/orchestrator.mjs';

const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon', 'routes');

// Catches a whole class of 500s: a route calling a method the orchestrator does
// not implement. These only surface at request time, never at import time.
test('routes only call orchestrator methods that exist', () => {
  // Walk the prototype chain so inherited methods (EventEmitter on/off/emit)
  // are recognised too.
  const known = new Set();
  for (let proto = AgentOrchestrator.prototype; proto; proto = Object.getPrototypeOf(proto)) {
    for (const key of Object.getOwnPropertyNames(proto)) known.add(key);
  }

  const missing = [];
  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith('.mjs')) continue;
    const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
    // Exclude module specifiers such as './agent/orchestrator.mjs'.
    for (const match of source.matchAll(/\borchestrator\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const method = match[1];
      if (!known.has(method)) missing.push(`${file}: orchestrator.${method}()`);
    }
  }

  assert.deepEqual(missing, [], `routes reference missing orchestrator methods:\n${missing.join('\n')}`);
});

test('the orchestrator exposes no obviously dead private helpers', () => {
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon', 'agent', 'orchestrator.mjs'),
    'utf8',
  );
  // _use() was defined but never called; it described storage selection that
  // does not exist and only invites confusion about run persistence.
  const defined = [...source.matchAll(/^  (?:async )?(_[A-Za-z_$][\w$]*)\(/gm)].map((m) => m[1]);
  const uncalled = defined.filter((name) => {
    const uses = [...source.matchAll(new RegExp(`this\\.${name}\\s*\\(`, 'g'))].length;
    return uses === 0;
  });

  assert.deepEqual(uncalled, [], `unused private helpers: ${uncalled.join(', ')}`);
});
