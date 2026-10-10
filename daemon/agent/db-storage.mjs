import { prepare, transaction } from '../db/connection.mjs';

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
  return hydrateRuns(runs);
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// Step payloads live in the config column, and step results live on the step
// rows, so both must be folded back onto the run for callers to see them.
function hydrateRuns(runs) {
  if (!runs.length) return runs;

  const ids = runs.map((r) => r.id);
  const stepRows = prepare(
    `SELECT * FROM agent_run_steps WHERE run_id IN (${ids.map(() => '?').join(',')}) ORDER BY run_id, step_index`,
  ).all(...ids);

  const byRun = new Map(ids.map((id) => [id, []]));
  for (const row of stepRows) byRun.get(row.run_id)?.push(row);

  for (const run of runs) {
    run.metadata = parseJson(run.metadata, {});

    const rows = byRun.get(run.id) || [];
    run.steps = rows.map((row) => ({ ...parseJson(row.config, {}), ...row, config: undefined }));

    // Rebuild the run-level output the executor returns for in-memory runs.
    run.output = rows
      .filter((row) => row.status && row.status !== 'pending')
      .map((row) => ({
        step: row.name || row.type,
        type: row.type,
        status: row.status,
        output: row.output,
        error: row.error,
        durationMs: row.duration_ms ?? 0,
      }));
  }
  return runs;
}

export function getRunById(userId, runId) {
  const run = prepare('SELECT * FROM agent_runs WHERE id = ? AND user_id = ?').get(runId, userId);
  if (!run) return null;
  return hydrateRuns([run])[0];
}

export function getRunByIdAny(runId) {
  const run = prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId);
  if (!run) return null;
  return hydrateRuns([run])[0];
}

export function insertRun(run) {
  transaction(() => {
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
  });
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

// Step output is not always a string. `review` stores the review summary object,
// `condition` stores a boolean, and a provider can return structured content.
// node:sqlite refuses to bind an object or a boolean, failing the whole run with
// "Provided value cannot be bound to SQLite parameter 2" and no indication of
// which step or value was at fault. Anything that is not a plain string is
// serialised, so the column stays text and the step keeps its result.
function bindableOutput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function insertStepResult(runId, stepIndex, stepResult) {
  prepare(
    `UPDATE agent_run_steps SET status = ?, output = ?, error = ?, duration_ms = ?, completed_at = datetime('now')
     WHERE run_id = ? AND step_index = ?`,
  ).run(
    stepResult.status,
    bindableOutput(stepResult.output),
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
