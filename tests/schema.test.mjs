import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const SCHEMA_FILES = [
  'schemas/agent-pack.schema.json',
  'schemas/capability-pack.schema.json',
  'schemas/compiled-context.schema.json',
  'schemas/gate-result.schema.json',
  'schemas/policy-pack.schema.json',
  'schemas/trail-session.schema.json',
];

test('all schema files are valid JSON', () => {
  for (const file of SCHEMA_FILES) {
    const absPath = path.join(DIR, file);
    const schema = loadJson(absPath);
    assert.ok(schema.$schema, `${file}: missing $schema`);
    assert.ok(schema.title || schema.$id, `${file}: missing title or $id`);
    assert.ok(schema.type, `${file}: missing type`);
  }
});

test('all schemas are draft-2020-12', () => {
  for (const file of SCHEMA_FILES) {
    const schema = loadJson(path.join(DIR, file));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', `${file}: expected draft-2020-12`);
  }
});

test('all agent JSON files match agent-pack schema', () => {
  const schema = loadJson(path.join(DIR, 'schemas/agent-pack.schema.json'));
  const required = new Set(schema.required || []);

  const agentDir = path.join(DIR, 'agents');
  const agents = fs.readdirSync(agentDir).filter((f) => f.endsWith('.agent.json'));

  assert.ok(agents.length >= 3, 'Expected at least 3 agent files');

  for (const agentFile of agents) {
    const agent = loadJson(path.join(agentDir, agentFile));
    for (const req of required) {
      assert.ok(req in agent, `${agentFile}: missing required field "${req}"`);
    }
    assert.equal(typeof agent.id, 'string', `${agentFile}: id must be string`);
    assert.equal(typeof agent.title, 'string', `${agentFile}: title must be string`);
    assert.ok(Array.isArray(agent.handoff), `${agentFile}: handoff must be array`);
  }
});

test('all pack JSON files have required fields', () => {
  const packSchema = loadJson(path.join(DIR, 'schemas/capability-pack.schema.json'));
  const required = new Set(packSchema.required || []);

  function walkPacks(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walkPacks(fullPath);
      } else if (entry.name.endsWith('.pack.json')) {
        const pack = loadJson(fullPath);
        const name = path.relative(path.join(DIR, 'packs'), fullPath);
        for (const req of required) {
          if (!(req in pack)) {
            assert.ok(req in pack, `${name}: missing required field "${req}"`);
          }
        }
        assert.ok(Array.isArray(pack.instructions), `${name}: instructions must be array`);
        assert.ok(pack.instructions.length > 0, `${name}: instructions must not be empty`);
        assert.equal(typeof pack.tokenCost, 'number', `${name}: tokenCost must be number`);
        assert.ok(Number.isInteger(pack.tokenCost), `${name}: tokenCost must be integer`);
      }
    }
  }

  walkPacks(path.join(DIR, 'packs'));
});

test('all adapter JSON files are valid', () => {
  const adapterDir = path.join(DIR, 'adapters');
  const adapters = fs.readdirSync(adapterDir, { withFileTypes: true }).filter((e) => e.isDirectory());

  assert.ok(adapters.length >= 3);

  for (const entry of adapters) {
    const adapterPath = path.join(adapterDir, entry.name, 'adapter.json');
    const adapter = loadJson(adapterPath);
    assert.ok(adapter.id, `${entry.name}: missing id`);
    assert.ok(adapter.title, `${entry.name}: missing title`);
    assert.ok(Array.isArray(adapter.rules), `${entry.name}: rules must be array`);
  }
});

test('trail template is valid', () => {
  const templateDir = path.join(DIR, 'trail-template');
  const indexPath = path.join(templateDir, 'index.md');
  const sessionPath = path.join(templateDir, 'session.md');

  assert.ok(fs.existsSync(indexPath), 'trail-template/index.md missing');
  assert.ok(fs.existsSync(sessionPath), 'trail-template/session.md missing');

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert.ok(indexContent.includes('Active session'), 'index.md missing Active session');

  const sessionContent = fs.readFileSync(sessionPath, 'utf8');
  assert.ok(sessionContent.includes('## Objective'), 'session.md missing Objective section');
  assert.ok(sessionContent.includes('## Handoff Summary'), 'session.md missing Handoff Summary');
});
