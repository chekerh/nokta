#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { port: 4217 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === 'ui') continue;
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = parseInt(argv[i + 1], 10);
      i++;
    }
  }
  return args;
}

async function waitForDaemon(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/v1/health`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

async function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

async function main() {
  const args = parseArgs(process.argv);
  const port = args.port;

  console.log('\n  \u26a1 Nokta Dashboard\n');
  console.log(`  Starting daemon on port ${port}...`);

  const daemon = spawn(process.execPath, [path.join(DIR, 'index.mjs'), '--port', String(port)], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const ready = await waitForDaemon(port);
  if (!ready) {
    console.error('  Failed to start daemon');
    daemon.kill();
    process.exit(1);
  }

  const url = `http://localhost:${port}`;
  console.log(`  \x1b[36mDashboard ready at ${url}\x1b[0m`);
  openBrowser(url);

  process.on('SIGINT', () => {
    daemon.kill();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    daemon.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start UI:', err.message);
  process.exit(1);
});
