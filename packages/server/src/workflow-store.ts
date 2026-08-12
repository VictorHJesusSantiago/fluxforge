import { randomUUID } from 'node:crypto';
import type { WorkflowDefinition } from '@fluxforge/core';
import type { FluxforgeDb } from './db.js';

interface WorkflowRow {
  id: string;
  name: string;
  definition: string;
  created_at: number;
  updated_at: number;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`no workflow with id "${id}"`);
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowStore {
  constructor(private readonly db: FluxforgeDb) {}

  /**
   * Creates a new workflow, or overwrites the whole definition of an existing one if `id` is
   * given. The storage id is always the single source of truth for "which workflow is this" —
   * `definition.id` is force-set to match it before saving, even if the caller's JSON body had a
   * different (or missing, or stale-from-a-copy-paste) value there. Without this, `RunState`
   * (which `@fluxforge/core`'s executor stamps with `workflow.id`, reading straight from the
   * definition) could disagree with the id every other endpoint uses to look the workflow up —
   * exactly the bug this fixes: a client posting `{ definition: { id: "wf" } }` while the store
   * mints its own random id for the row would make every run it produces unfindable via
   * `GET /api/workflows/:id/runs`, and every webhook route it matches would 500 on execute().
   */
  save(input: { id?: string; name: string; definition: WorkflowDefinition }): string {
    const id = input.id ?? randomUUID();
    const definition: WorkflowDefinition = { ...input.definition, id };
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO workflows (id, name, definition, created_at, updated_at)
         VALUES (@id, @name, @definition, @now, @now)
         ON CONFLICT(id) DO UPDATE SET name = @name, definition = @definition, updated_at = @now`,
      )
      .run({ id, name: input.name, definition: JSON.stringify(definition), now });
    return id;
  }

  get(id: string): WorkflowDefinition {
    const row = this.db.prepare<{ id: string }, WorkflowRow>(`SELECT * FROM workflows WHERE id = @id`).get({
      id,
    }) as WorkflowRow | undefined;
    if (row === undefined) throw new WorkflowNotFoundError(id);
    return JSON.parse(row.definition) as WorkflowDefinition;
  }

  tryGet(id: string): WorkflowDefinition | undefined {
    try {
      return this.get(id);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) return undefined;
      throw error;
    }
  }

  list(): WorkflowSummary[] {
    const rows = this.db.prepare(`SELECT id, name, created_at, updated_at FROM workflows ORDER BY updated_at DESC`).all() as Array<
      Pick<WorkflowRow, 'id' | 'name' | 'created_at' | 'updated_at'>
    >;
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM workflows WHERE id = @id`).run({ id });
  }
}
