import { prepare } from '../db/connection.mjs';

export function getAllRuns(userId, opts = {}) {
  let sql = 'SELECT * FROM agent_runs WHERE user_id = ?';
  const params = [userId];

  if (opts.status) {
    sql += ' AND status = ?';
    params.push(opts.status);
  }
  if (opts.trigger) {
    sql += ' AND trigger = ?';
    params.push(opts.trigger);
  }

  sql += ' ORDER BY created_at DESC';

  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  const runs = prepare(sql).all(...params);
  for (const run of runs) {
    if (run.metadata) {
      try {
        run.metadata = JSON.parse(run.metadata);
      } catch {
        run.metadata = {};
      }
    }
  }
  return runs;
}

export function getRunById(userId, runId) {
  const run = prepare('SELECT * FROM agent_runs WHERE id = ? AND user_id = ?').get(runId, userId);
  if (!run) return null;
  if (run.metadata) {
    try {
      run.metadata = JSON.parse(run.metadata);
    } catch {
      run.metadata = {};
    }
  }
  run.steps = prepare('SELECT * FROM agent_run_steps WHERE run_id = ? ORDER BY step_index').all(runId);
  return run;
}

export function insertRun(run) {
  prepare(
    `INSERT INTO agent_runs (id, user_id, project_root, goal, status, trigger, current_step, error, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.user_id,
    run.project_root || '',
    run.goal,
    run.status,
    run.trigger,
    run.currentStep || 0,
    run.error || null,
    JSON.stringify(run.metadata || {}),
    run.createdAt,
    run.updatedAt,
  );

  if (run.steps && run.steps.length) {
    const stmt = prepare(
      `INSERT INTO agent_run_steps (id, run_id, step_index, type, name, config, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    );
    for (let i = 0; i < run.steps.length; i++) {
      const step = run.steps[i];
      stmt.run(`${run.id}-step-${i}`, run.id, i, step.type, step.name || step.type, JSON.stringify(step));
    }
  }
}

export function updateRunStatus(runId, updates) {
  const fields = [];
  const params = [];
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.currentStep !== undefined) {
    fields.push('current_step = ?');
    params.push(updates.currentStep);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    params.push(updates.error);
  }
  if (updates.metadata !== undefined) {
    fields.push('metadata = ?');
    params.push(JSON.stringify(updates.metadata));
  }
  fields.push("updated_at = datetime('now')");
  params.push(runId);
  if (fields.length > 1) {
    prepare(`UPDATE agent_runs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }
}

export function insertStepResult(runId, stepIndex, stepResult) {
  prepare(
    `UPDATE agent_run_steps SET status = ?, output = ?, error = ?, duration_ms = ?, completed_at = datetime('now')
     WHERE run_id = ? AND step_index = ?`,
  ).run(
    stepResult.status,
    stepResult.output || null,
    stepResult.error || null,
    stepResult.durationMs || null,
    runId,
    stepIndex,
  );
}

export function deleteRunById(userId, runId) {
  prepare('DELETE FROM agent_run_steps WHERE run_id = ?').run(runId);
  prepare('DELETE FROM agent_runs WHERE id = ? AND user_id = ?').run(runId, userId);
}
