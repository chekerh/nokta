import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectProjectTools, detectInstalledTools, inspectProjectTooling, TOOL_REGISTRY } from '../daemon/lib/tool-detector.mjs';

async function fixture(files) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-tool-detect-')));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return root;
}

test('detects Claude Code from a .claude directory and CLAUDE.md', async () => {
  const root = await fixture({ '.claude/settings.json': '{}', 'CLAUDE.md': '# conventions' });
  const result = await detectProjectTools(root);
  const claude = result.tools.find(tool => tool.id === 'claude-code');
  assert.ok(claude, 'claude-code should be detected');
  assert.equal(result.primary.id, 'claude-code');
  assert.ok(result.instructionFiles.includes('CLAUDE.md'));
});

test('detects a tool from a package.json dependency', async () => {
  const root = await fixture({ 'package.json': JSON.stringify({ devDependencies: { '@openai/codex': '^1.0.0' } }) });
  const result = await detectProjectTools(root);
  assert.ok(result.tools.some(tool => tool.id === 'codex'));
});

test('ranks the more-evidenced tool as primary', async () => {
  const root = await fixture({ '.cursor/rules': 'x', '.cursorrules': 'y', 'CLAUDE.md': 'z', '.claude/agent.json': '{}' });
  const result = await detectProjectTools(root);
  assert.equal(result.primary.id, 'claude-code');
});

test('returns no tools for an empty project', async () => {
  const root = await fixture({ 'readme.txt': 'hello' });
  const result = await detectProjectTools(root);
  assert.equal(result.tools.length, 0);
  assert.equal(result.primary, null);
});

test('detects installed tools from a fake home directory', async () => {
  const home = await fixture({ '.claude/thing': 'x', '.config/opencode/thing': 'y' });
  const installed = await detectInstalledTools(home);
  const ids = installed.map(tool => tool.id);
  assert.ok(ids.includes('claude-code'));
  assert.ok(ids.includes('opencode'));
});

test('inspectProjectTooling labels installed agents that are unused here', async () => {
  const home = await fixture({ '.claude/thing': 'x', '.windsurf/thing': 'y' });
  const project = await fixture({ 'CLAUDE.md': 'z' });
  const result = await inspectProjectTooling(project, { homeDir: home });
  assert.ok(result.installed.length >= 2);
  const windsurf = result.installed.find(tool => tool.id === 'windsurf');
  assert.ok(windsurf && !windsurf.inProject, 'windsurf is installed but not used in this project');
  const claude = result.installed.find(tool => tool.id === 'claude-code');
  assert.ok(claude?.inProject, 'claude-code is used in the project');
  assert.ok(!('candidates' in result), 'the redundant candidates list was replaced by the inProject label');
});

test('a shared AGENTS.md credits every declaring tool but never picks the primary', async () => {
  const root = await fixture({ 'AGENTS.md': '# shared', '.cursorrules': 'rules' });
  const result = await detectProjectTools(root);
  const ids = result.tools.map(tool => tool.id);
  for (const id of ['codex', 'opencode', 'aider', 'continue']) assert.ok(ids.includes(id), `${id} should be listed from the shared AGENTS.md`);
  assert.equal(result.primary.id, 'cursor', 'tool-specific evidence must outrank a shared protocol file');
  assert.ok(result.instructionFiles.includes('AGENTS.md'));
});

test('shared-only evidence lists the candidates but yields no primary', async () => {
  const root = await fixture({ 'AGENTS.md': '# shared' });
  const result = await detectProjectTools(root);
  assert.ok(result.tools.length >= 4, 'every tool declaring AGENTS.md is listed as evidence');
  assert.equal(result.primary, null, 'a shared file alone must not declare a primary tool');
  assert.ok(result.instructionFiles.includes('AGENTS.md'));
});

test('every registry entry has the shape the UI relies on', async () => {
  for (const tool of TOOL_REGISTRY) {
    assert.ok(tool.id && tool.name && tool.instructionFile, `registry entry ${tool.id} is missing a required field`);
    assert.ok(Array.isArray(tool.dirs) && Array.isArray(tool.files) && Array.isArray(tool.deps));
    assert.ok(Object.hasOwn(tool, 'sharedFile'), `registry entry ${tool.id} must declare sharedFile explicitly (null when it has none)`);
  }
});
