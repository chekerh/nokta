#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceService } from '../daemon/workspace/service.mjs';
import { createWorkspaceApp, listenAvailable } from '../daemon/workspace/server.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.NOKTA_DATA_DIR || path.join(projectDir, '.nokta'));
const args = process.argv.slice(2);
const portIndex = args.findIndex(arg => arg === '--ports' || arg === '--port');
const portSpec = portIndex >= 0 ? args[portIndex + 1] : process.env.NOKTA_PORTS || process.env.NOKTA_PORT || '4317,4318';
if (!portSpec || !/^\d+(,\d+)*$/.test(portSpec)) throw new Error('Use --ports 4317,4318');
const ports = [...new Set(portSpec.split(',').map(Number))];
if (ports.length > 5 || ports.some(port => port < 1 || port > 65535)) throw new Error('Specify one to five valid ports');
await fs.mkdir(dataDir, { recursive: true });
const lockPath = path.join(dataDir, 'workspace.pid');
try {
  const existing = Number(await fs.readFile(lockPath, 'utf8'));
  if (!Number.isInteger(existing) || existing < 1) throw new Error('Invalid workspace lock; inspect .nokta/workspace.pid');
  try { process.kill(existing, 0); throw new Error(`Workspace already running (PID ${existing}). See ${path.join(dataDir, 'workspace-runtime.json')} for its ports.`); }
  catch (error) {
    if (error.code !== 'ESRCH') throw error;
    await fs.unlink(lockPath);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(lockPath, String(process.pid), { flag: 'wx' });
const service = new WorkspaceService({ dataDir });
const listeners = [];
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const { server } of listeners) server.close();
  try { await service.close(); }
  finally { await fs.unlink(lockPath).catch(() => {}); }
}
try {
  await service.load();
  const app = createWorkspaceApp(service);
  for (const port of ports) listeners.push(await listenAvailable(app, port));
  const urls = listeners.map(({ port }) => `http://127.0.0.1:${port}`);
  await fs.writeFile(path.join(dataDir, 'workspace-runtime.json'), JSON.stringify({ pid: process.pid, urls, startedAt: new Date().toISOString() }, null, 2));
  console.log(`Nokta project workspace\n${urls.join('\n')}\nShared project state across all ports. Occupied ports are skipped.\nSkills: ${service.skills.root}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { close().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); }); });
} catch (error) {
  await close();
  throw error;
}
