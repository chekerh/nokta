import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../daemon/lib/config.mjs';

const ENV_KEYS = ['NOKTA_PORT', 'NOKTA_HOST', 'NOKTA_LOG_LEVEL', 'NOKTA_CORS_ORIGIN', 'NOKTA_RATE_LIMIT'];

async function makeFixture(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `nokta-config-${name}-`));
}

async function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
}

function clearEnvVars() {
  for (const key of ENV_KEYS) delete process.env[key];
}

test('loadConfig returns defaults when no config file or env vars', async () => {
  clearEnvVars();
  const root = await makeFixture('empty');
  const config = await loadConfig(root);
  assert.equal(config.port, 4217);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.projectRoot, root);
});

test('loadConfig respects env vars', async () => {
  clearEnvVars();
  process.env.NOKTA_PORT = '9999';
  process.env.NOKTA_HOST = '0.0.0.0';
  process.env.NOKTA_LOG_LEVEL = 'debug';
  const root = await makeFixture('env');
  const config = await loadConfig(root);
  assert.equal(config.port, 9999);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.logLevel, 'debug');
  clearEnvVars();
});

test('loadConfig merges file config with defaults', async () => {
  clearEnvVars();
  const root = await makeFixture('file');
  await writeFile(
    root,
    '.nokta/config.json',
    JSON.stringify({
      port: 5555,
      cors: { origin: 'https://example.com' },
    }),
  );
  const config = await loadConfig(root);
  assert.equal(config.port, 5555);
  assert.equal(config.cors.origin, 'https://example.com');
  assert.equal(config.host, '127.0.0.1');
});

test('loadConfig handles bad config file gracefully', async () => {
  clearEnvVars();
  const root = await makeFixture('bad');
  await writeFile(root, '.nokta/config.json', 'not valid json');
  const config = await loadConfig(root);
  assert.equal(config.port, 4217);
  assert.ok(config.providers);
});

test('loadConfig provides default provider configs', async () => {
  const root = await makeFixture('providers');
  const config = await loadConfig(root);
  assert.ok(config.providers.ollama);
  assert.ok(config.providers.openai);
  assert.ok(config.providers.claude);
  assert.ok(config.providers.openrouter);
});

test('loadConfig merges custom provider configs', async () => {
  const root = await makeFixture('custom');
  await writeFile(
    root,
    '.nokta/config.json',
    JSON.stringify({
      providers: { ollama: { baseUrl: 'http://custom:11434' } },
    }),
  );
  const config = await loadConfig(root);
  assert.equal(config.providers.ollama.baseUrl, 'http://custom:11434');
});
