const cleanupFns = [];
let shutdownInProgress = false;

export function registerCleanup(fn) {
  cleanupFns.push(fn);
}

export function setupGracefulShutdown(server, options = {}) {
  const drainTimeout = options.drainTimeout || 30000;
  const log = options.log || { info: console.log, error: console.error, warn: console.warn };

  const shutdown = async (signal) => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    log.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close(() => {
      log.info('HTTP server closed');
    });

    const cleanupPromise = Promise.all(cleanupFns.map((fn) => Promise.resolve().then(fn)));
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), drainTimeout);
    });

    try {
      await Promise.race([cleanupPromise, timeoutPromise]);
      log.info('All cleanup completed');
    } catch (err) {
      log.warn('Shutdown cleanup timed out or failed', { error: err.message });
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
