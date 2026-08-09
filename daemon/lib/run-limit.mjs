import { prepare } from '../db/connection.mjs';

const MAX_CONCURRENT_RUNS = 5;

export function canStartRun(userId) {
  const result = prepare(
    "SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND status IN ('created', 'running')",
  ).get(userId);
  return result.count < MAX_CONCURRENT_RUNS;
}

export function getActiveRunCount(userId) {
  const result = prepare(
    "SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ? AND status IN ('created', 'running')",
  ).get(userId);
  return result.count;
}
