import { describe, it, expect, beforeEach } from 'vitest';
import { z, defineNode } from '@fluxforge/sdk';
import { NodeRegistry } from '@fluxforge/registry';
import { RunEventBus, type RunEvent } from '@fluxforge/core';
import { openDb, type FluxforgeDb } from '../db.js';
import { WorkflowStore } from '../workflow-store.js';
import { RunStore } from '../run-store.js';
import { ExecutionService } from '../execution-service.js';

const double = defineNode({
  type: 'test.double',
  displayName: 'Double',
  description: 'Doubles n',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({}),
  async run(ctx) {
    return { main: (ctx.input.main ?? []).map((item) => ({ n: (item.n as number) * 2 })) };
  },
});

const readsCred = defineNode({
  type: 'test.reads-cred',
  displayName: 'ReadsCred',
  description: 'reads a credential',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({}),
  async run(ctx) {
    return { main: [{ token: ctx.getCredential('api')?.token ?? null }] };
  },
});

let db: FluxforgeDb;
let workflowStore: WorkflowStore;
let runStore: RunStore;
let registry: NodeRegistry;

beforeEach(() => {
  db = openDb(':memory:');
  workflowStore = new WorkflowStore(db);
  runStore = new RunStore(db);
  registry = new NodeRegistry();
  registry.registerAll([double, readsCred]);
});

describe('ExecutionService.execute', () => {
  it('runs the workflow and persists the resulting RunState', async () => {
    const workflowId = workflowStore.save({
      id: 'wf1',
      name: 'doubler',
      definition: { id: 'wf1', name: 'doubler', nodes: [{ id: 'a', type: 'test.double', params: {} }], edges: [] },
    });

    const service = new ExecutionService(registry, runStore, workflowStore, { getCredential: () => undefined });
    const state = await service.execute(workflowId, [{ n: 5 }]);

    expect(state.status).toBe('succeeded');
    expect(state.nodes.a?.output?.main).toEqual([{ n: 10 }]);
    expect(runStore.get(state.runId)).toEqual(state);
  });

  it('routes credentials through to node execution', async () => {
    const workflowId = workflowStore.save({
      id: 'wf2',
      name: 'cred',
      definition: { id: 'wf2', name: 'cred', nodes: [{ id: 'a', type: 'test.reads-cred', params: {} }], edges: [] },
    });

    const service = new ExecutionService(registry, runStore, workflowStore, {
      getCredential: (name) => (name === 'api' ? { token: 'secret' } : undefined),
    });
    const state = await service.execute(workflowId);

    expect(state.nodes.a?.output?.main).toEqual([{ token: 'secret' }]);
  });

  it('emits live events through the given RunEventBus as the run proceeds', async () => {
    const workflowId = workflowStore.save({
      id: 'wf3',
      name: 'events',
      definition: { id: 'wf3', name: 'events', nodes: [{ id: 'a', type: 'test.double', params: {} }], edges: [] },
    });

    const events: RunEvent[] = [];
    const bus = new RunEventBus();
    bus.subscribe((e) => events.push(e));

    const service = new ExecutionService(registry, runStore, workflowStore, { getCredential: () => undefined });
    await service.execute(workflowId, [{ n: 1 }], bus);

    expect(events.map((e) => e.kind)).toContain('run.started');
    expect(events.map((e) => e.kind)).toContain('run.succeeded');
  });
});

describe('ExecutionService.resume', () => {
  it('continues a partially-completed run without re-running finished nodes', async () => {
    const workflowId = workflowStore.save({
      id: 'wf4',
      name: 'chain',
      definition: {
        id: 'wf4',
        name: 'chain',
        nodes: [
          { id: 'a', type: 'test.double', params: {} },
          { id: 'b', type: 'test.double', params: {} },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    });

    const service = new ExecutionService(registry, runStore, workflowStore, { getCredential: () => undefined });
    const full = await service.execute(workflowId, [{ n: 2 }]);

    const crashed = { ...full, status: 'running' as const, nodes: { ...full.nodes, b: { status: 'pending' as const, attempts: 0 } } };
    runStore.save(crashed);

    const resumed = await service.resume(full.runId);
    expect(resumed.status).toBe('succeeded');
    expect(resumed.nodes.b?.output?.main).toEqual([{ n: 8 }]);
  });

  it('throws for an unknown run id', async () => {
    const service = new ExecutionService(registry, runStore, workflowStore, { getCredential: () => undefined });
    await expect(service.resume('nope')).rejects.toThrow(/no run with id/);
  });
});
