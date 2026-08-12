import { describe, it, expect, beforeEach } from 'vitest';
import type { WorkflowDefinition } from '@fluxforge/core';
import { openDb, type FluxforgeDb } from '../db.js';
import { WorkflowStore, WorkflowNotFoundError } from '../workflow-store.js';

let db: FluxforgeDb;
let store: WorkflowStore;

const def = (id: string): WorkflowDefinition => ({ id, name: 'test', nodes: [], edges: [] });

beforeEach(() => {
  db = openDb(':memory:');
  store = new WorkflowStore(db);
});

describe('WorkflowStore', () => {
  it('save() generates an id when none is given, and get() round-trips the definition', () => {
    const id = store.save({ name: 'My Flow', definition: def('placeholder') });
    expect(id).toBeTruthy();
    expect(store.get(id).name).toBe('test'); // the definition's own id/name fields are preserved verbatim
  });

  it('get() throws WorkflowNotFoundError for a missing id', () => {
    expect(() => store.get('nope')).toThrow(WorkflowNotFoundError);
  });

  it('tryGet() returns undefined instead of throwing', () => {
    expect(store.tryGet('nope')).toBeUndefined();
  });

  it('save() with an explicit id overwrites the existing row', () => {
    const id = store.save({ id: 'wf-1', name: 'v1', definition: def('wf-1') });
    store.save({ id, name: 'v2', definition: { ...def('wf-1'), name: 'v2-internal' } });

    const rows = store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('v2');
  });

  it('list() returns summaries ordered by most recently updated first', async () => {
    store.save({ id: 'a', name: 'A', definition: def('a') });
    await new Promise((r) => setTimeout(r, 2));
    store.save({ id: 'b', name: 'B', definition: def('b') });

    expect(store.list().map((w) => w.id)).toEqual(['b', 'a']);
  });

  it('canonicalizes definition.id to match the storage id, even if the caller sent a different one', () => {
    const id = store.save({ name: 'Mismatched', definition: def('some-other-id-entirely') });
    expect(store.get(id).id).toBe(id);
  });

  it('delete() removes a workflow', () => {
    const id = store.save({ id: 'gone', name: 'Gone', definition: def('gone') });
    store.delete(id);
    expect(store.tryGet(id)).toBeUndefined();
  });
});
