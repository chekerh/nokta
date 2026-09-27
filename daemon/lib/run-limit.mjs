import { prepare } from '../db/connection.mjs';

const MAX_CONCURRENT_RUNS = 5;

// A run that never reached a terminal state (worker crash, daemon restart, lost
// queue) otherwise holds a concurrency slot forever and wedges the API with 429.
const STALE_RUN_MS = 15 * 60 * 1000;

const STALE_REASON = 'Run abandoned: no worker progress before the stale-run timeout';

// updated_at is written in two formats (ISO by insertRun, datetime('now') by
// updateRunStatus), so compare via julianday() instead of string ordering.
export function reapStaleRuns(userId, maxAgeMs = STALE_RUN_MS) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return prepare(
    `UPDATE agent_runs
        SET status = 'failed', error = ?, updated_at = ?
      WHERE user_id = ?
        AND status IN ('created', 'running')
        AND julianday(updated_at) < julianday(?)`,
  ).run(STALE_REASON, new Date().toISOString(), userId, cutoff).changes;
}

export function canStartRun(userId) {
  reapStaleRuns(userId);
  return getActiveRunCount(userId) < MAX_CONCURRENT_RUNS;
}

export function getActiveRunCount(userId) {
  const result = prepare(
    "SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND status IN ('created', 'running')",
  ).get(userId);
  return result.count;
}
