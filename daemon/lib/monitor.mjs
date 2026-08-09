import * as os from 'node:os';
import { getDb } from '../db/connection.mjs';

export async function getHealthStatus() {
  const checks = {};

  try {
    const db = getDb();
    const start = Date.now();
    db.prepare('SELECT 1').get();
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
  }

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const usedPercent = (mem.rss / totalMem) * 100;
  checks.memory = {
    status: usedPercent > 90 ? 'critical' : usedPercent > 80 ? 'warning' : 'ok',
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    usedPercent: Math.round(usedPercent * 100) / 100,
  };

  checks.uptime = process.uptime();
  checks.timestamp = new Date().toISOString();

  const overallStatus = Object.values(checks).some((c) => c.status === 'critical')
    ? 'critical'
    : Object.values(checks).some((c) => c.status === 'warning')
      ? 'warning'
      : 'ok';

  return { status: overallStatus, checks };
}
