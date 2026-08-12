import { describe, it, expect, beforeEach } from 'vitest';
import type { RunState } from '@fluxforge/core';
import { openDb, type FluxforgeDb } from '../db.js';
import { RunStore } from '../run-store.js';

let db: FluxforgeDb;
let store: RunStore;

function makeState(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: 'run-1',
    workflowId: 'wf-1',
    status: 'running',
    nodes: {},
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  db = openDb(':memory:');
  store = new RunStore(db);
});

describe('RunStore', () => {
  it('saves and retrieves a run state verbatim', () => {
    const state = makeState({ nodes: { a: { status: 'succeeded', attempts: 1, output: { main: [{ x: 1 }] } } } });
    store.save(state);
    expect(store.get('run-1')).toEqual(state);
  });

  it('returns undefined for an unknown run id', () => {
    expect(store.get('nope')).toBeUndefined();
  });

  it('save() again with the same runId updates the row (status transitions)', () => {
    store.save(makeState({ status: 'running' }));
    store.save(makeState({ status: 'succeeded', finishedAt: new Date('2026-01-01T00:01:00.000Z').toISOString() }));

    const final = store.get('run-1');
    expect(final?.status).toBe('succeeded');
    expect(final?.finishedAt).toBeDefined();
  });

  it('listForWorkflow returns only that workflow\'s runs, newest first', () => {
    store.save(makeState({ runId: 'r1', workflowId: 'wf-A', startedAt: new Date('2026-01-01T00:00:00Z').toISOString() }));
    store.save(makeState({ runId: 'r2', workflowId: 'wf-A', startedAt: new Date('2026-01-01T00:01:00Z').toISOString() }));
    store.save(makeState({ runId: 'r3', workflowId: 'wf-B', startedAt: new Date('2026-01-01T00:02:00Z').toISOString() }));

    const runs = store.listForWorkflow('wf-A');
    expect(runs.map((r) => r.runId)).toEqual(['r2', 'r1']);
  });

  it('listForWorkflow respects the limit', () => {
    for (let i = 0; i < 5; i += 1) {
      store.save(makeState({ runId: `r${i}`, startedAt: new Date(2026, 0, 1, 0, i).toISOString() }));
    }
    expect(store.listForWorkflow('wf-1', 2)).toHaveLength(2);
  });
});
