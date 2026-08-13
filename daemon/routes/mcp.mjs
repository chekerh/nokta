import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

const serverProcesses = new Map();
const pendingRequests = new Map();
let requestId = 0;

async function loadMcpConfig(target) {
  const configPath = path.join(target || process.cwd(), 'mcp-server-config.json');
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function getServerProcess(config, log) {
  const key = `${config.name}:${config.command || 'npx'}`;
  if (serverProcesses.has(key)) {
    const existing = serverProcesses.get(key);
    if (existing.process.exitCode === null) return existing;
    existing.process.kill();
    serverProcesses.delete(key);
  }

  const proc = spawn(config.command || 'npx', ['-y', `@modelcontextprotocol/server-${config.type || 'filesystem'}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });

  let buffer = '';
  proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.id && pendingRequests.has(parsed.id)) {
          pendingRequests.get(parsed.id).resolve(parsed);
          pendingRequests.delete(parsed.id);
        }
      } catch {}
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) log?.warn('MCP server stderr', { server: config.name, stderr: text.slice(0, 200) });
  });

  proc.on('close', (code) => {
    serverProcesses.delete(key);
    if (log) log.info('MCP server exited', { server: config.name, code });
  });

  const entry = { process: proc, config };
  serverProcesses.set(key, entry);
  return entry;
}

async function executeMcpTool(config, toolName, args, log) {
  const entry = getServerProcess(config, log);
  const proc = entry.process;

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('MCP tool execution timed out'));
    }, 30000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    proc.stdin.write(request + '\n');
  });
}

export function registerMcpRoutes(app, log) {
  app.post(
    '/api/v1/mcp/execute',
    asyncHandler(async (req, res) => {
      const { serverId, toolName, args, target } = req.body;
      if (!serverId || !toolName) throw new AppError('serverId and toolName are required', 400);

      const servers = await loadMcpConfig(target);
      const config = servers.find((s) => s.name === serverId);
      if (!config) throw new AppError(`MCP server not found: ${serverId}`, 404);

      const result = await executeMcpTool(config, toolName, args, log);
      res.json({ result });
    }),
  );

  app.get(
    '/api/v1/mcp/servers',
    asyncHandler(async (req, res) => {
      const { target } = req.query;
      const servers = await loadMcpConfig(target);
      res.json({ servers });
    }),
  );

  app.post(
    '/api/v1/mcp/servers',
    asyncHandler(async (req, res) => {
      const { target, servers } = req.body;
      if (!Array.isArray(servers)) throw new AppError('servers array is required', 400);
      const configPath = path.join(target || process.cwd(), 'mcp-server-config.json');
      await fs.writeFile(configPath, JSON.stringify(servers, null, 2), 'utf8');

      for (const [key, entry] of serverProcesses) {
        try {
          entry.process.kill();
        } catch {}
        serverProcesses.delete(key);
      }

      res.json({ success: true });
    }),
  );
}
