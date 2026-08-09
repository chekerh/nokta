#!/usr/bin/env node
import { createServer } from './server.mjs';
import { loadConfig } from './lib/config.mjs';
import { logger, setLogLevel, setLogPath } from './lib/logger.mjs';
import { loadDotenv } from './lib/dotenv.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'daemon') continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const projectRoot = args.project || process.cwd();

  loadDotenv(projectRoot);

  const config = await loadConfig(projectRoot);
  if (args.port) config.port = parseInt(args.port, 10);
  if (args.host) config.host = args.host;
  if (args.logLevel) config.logLevel = args.logLevel;
  if (args.project) config.projectRoot = args.project;

  setLogLevel(config.logLevel);
  if (process.env.NOKTA_LOG_PATH) setLogPath(process.env.NOKTA_LOG_PATH);
  const log = logger.child({ service: 'daemon' });

  const { app } = await createServer({
    port: config.port,
    host: config.host,
    projectRoot: config.projectRoot,
    corsOrigin: config.cors?.origin,
    log,
  });

  const server = app.listen(config.port, config.host, () => {
    log.info(`Nokta daemon running on http://${config.host}:${config.port}`);
    log.info(`Project root: ${config.projectRoot}`);
    if (process.send) {
      process.send({ type: 'ready', port: config.port });
    }
  });

  function shutdown(signal) {
    log.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message });
    shutdown('UNCAUGHT');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { error: reason?.message || String(reason) });
  });
}

main().catch((err) => {
  logger.error('Failed to start Nokta daemon', { error: err.message });
  process.exit(1);
});
