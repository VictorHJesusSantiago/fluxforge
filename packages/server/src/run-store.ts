import type { RunState } from '@fluxforge/core';
import type { FluxforgeDb } from './db.js';

interface RunRow {
  id: string;
  workflow_id: string;
  status: string;
  state: string;
  started_at: number;
  finished_at: number | null;
}

/** Persists every `RunState` the executor produces — what makes a run's history survive a restart, and what `resume()` reads back to continue a crashed one. */
export class RunStore {
  constructor(private readonly db: FluxforgeDb) {}

  save(state: RunState): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, workflow_id, status, state, started_at, finished_at)
         VALUES (@id, @workflowId, @status, @state, @startedAt, @finishedAt)
         ON CONFLICT(id) DO UPDATE SET status = @status, state = @state, finished_at = @finishedAt`,
      )
      .run({
        id: state.runId,
        workflowId: state.workflowId,
        status: state.status,
        state: JSON.stringify(state),
        startedAt: Date.parse(state.startedAt),
        finishedAt: state.finishedAt === undefined ? null : Date.parse(state.finishedAt),
      });
  }

  get(runId: string): RunState | undefined {
    const row = this.db.prepare<{ id: string }, RunRow>(`SELECT * FROM runs WHERE id = @id`).get({
      id: runId,
    }) as RunRow | undefined;
    return row === undefined ? undefined : (JSON.parse(row.state) as RunState);
  }

  listForWorkflow(workflowId: string, limit = 50): RunState[] {
    const rows = this.db
      .prepare<{ workflowId: string; limit: number }, RunRow>(
        `SELECT * FROM runs WHERE workflow_id = @workflowId ORDER BY started_at DESC LIMIT @limit`,
      )
      .all({ workflowId, limit }) as RunRow[];
    return rows.map((r) => JSON.parse(r.state) as RunState);
  }
}
