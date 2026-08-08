import { describe, it, expect, vi } from 'vitest';
import { WorkflowExecutor } from '../executor.js';
import { RunEventBus } from '../events.js';
import type { NodeRunner, NodeRunnerResolver, RunEvent, WorkflowDefinition } from '../types.js';

/** A resolver test double: a plain map from node type to implementation, with call tracking. */
class TestResolver implements NodeRunnerResolver {
  readonly calls: string[] = [];
  constructor(private readonly runners: Record<string, NodeRunner>) {}
  resolve(nodeType: string): NodeRunner | undefined {
    const runner = this.runners[nodeType];
    if (runner === undefined) return undefined;
    return (ctx) => {
      this.calls.push(ctx.nodeId);
      return runner(ctx);
    };
  }
}

const passThrough: NodeRunner = async (ctx) => ({ main: ctx.input.main ?? [] });

/** Executor options with no real sleeping and a controllable clock, for fast/deterministic tests. */
function testOptions(resolver: NodeRunnerResolver, overrides: Partial<Parameters<typeof WorkflowExecutor.prototype.run>> = {}) {
  void overrides;
  return {
    resolver,
    sleep: async () => {}, // instant — retry-timing correctness is backoff.test.ts's job
    random: () => 0.5,
  };
}

describe('WorkflowExecutor — linear execution', () => {
  it('runs a simple chain and propagates output between nodes', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf1',
      name: 'chain',
      nodes: [
        { id: 'a', type: 'double', params: {} },
        { id: 'b', type: 'double', params: {} },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };

    const double: NodeRunner = async (ctx) => ({
      main: (ctx.input.main ?? []).map((item) => ({ n: (item.n as number) * 2 })),
    });

    const resolver = new TestResolver({ double });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run1', [{ n: 5 }]);

    expect(state.status).toBe('succeeded');
    expect(state.nodes.a?.output?.main).toEqual([{ n: 10 }]);
    expect(state.nodes.b?.output?.main).toEqual([{ n: 20 }]);
  });

  it('merges items from multiple incoming edges onto the same port', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-merge',
      name: 'merge',
      nodes: [
        { id: 'left', type: 'emit-left', params: {} },
        { id: 'right', type: 'emit-right', params: {} },
        { id: 'merge', type: 'pass', params: {} },
      ],
      edges: [{ from: 'left', to: 'merge' }, { from: 'right', to: 'merge' }],
    };
    const resolver = new TestResolver({
      'emit-left': async () => ({ main: [{ from: 'left' }] }),
      'emit-right': async () => ({ main: [{ from: 'right' }] }),
      pass: passThrough,
    });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run2');

    expect(state.status).toBe('succeeded');
    const merged = state.nodes.merge?.output?.main ?? [];
    expect(merged).toHaveLength(2);
    expect(merged.map((i) => i.from).sort()).toEqual(['left', 'right']);
  });
});

describe('WorkflowExecutor — branch skipping', () => {
  it('skips the unreached branch and everything downstream of it', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-branch',
      name: 'branch',
      nodes: [
        { id: 'check', type: 'if', params: {} },
        { id: 'onTrue', type: 'pass', params: {} },
        { id: 'onFalse', type: 'pass', params: {} },
        { id: 'afterFalse', type: 'pass', params: {} },
      ],
      edges: [
        { from: 'check', to: 'onTrue', fromPort: 'true' },
        { from: 'check', to: 'onFalse', fromPort: 'false' },
        { from: 'onFalse', to: 'afterFalse' },
      ],
    };
    const resolver = new TestResolver({
      if: async () => ({ true: [{ ok: true }], false: [] }),
      pass: passThrough,
    });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run3');

    expect(state.status).toBe('succeeded');
    expect(state.nodes.onTrue?.status).toBe('succeeded');
    expect(state.nodes.onFalse?.status).toBe('skipped');
    expect(state.nodes.afterFalse?.status).toBe('skipped');
    // The unreached branch's node runner must never actually be invoked — "skipped" means
    // skipped, not "run with empty input."
    expect(resolver.calls).not.toContain('onFalse');
    expect(resolver.calls).not.toContain('afterFalse');
  });

  it('a merge node after two branches runs once either side has data', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-reconverge',
      name: 'reconverge',
      nodes: [
        { id: 'check', type: 'if', params: {} },
        { id: 'onTrue', type: 'pass', params: {} },
        { id: 'onFalse', type: 'pass', params: {} },
        { id: 'after', type: 'pass', params: {} },
      ],
      edges: [
        { from: 'check', to: 'onTrue', fromPort: 'true' },
        { from: 'check', to: 'onFalse', fromPort: 'false' },
        { from: 'onTrue', to: 'after' },
        { from: 'onFalse', to: 'after' },
      ],
    };
    const resolver = new TestResolver({
      if: async () => ({ true: [{ ok: true }], false: [] }),
      pass: passThrough,
    });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run4');

    expect(state.nodes.after?.status).toBe('succeeded');
    expect(state.nodes.after?.output?.main).toEqual([{ ok: true }]);
  });
});

describe('WorkflowExecutor — retry and failure', () => {
  it('retries a node up to maxAttempts and succeeds within budget', async () => {
    let calls = 0;
    const flaky: NodeRunner = async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return { main: [{ ok: true }] };
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-retry',
      name: 'retry',
      nodes: [{ id: 'a', type: 'flaky', params: {}, retry: { maxAttempts: 3, backoff: 'fixed', baseDelayMs: 10 } }],
      edges: [],
    };
    const resolver = new TestResolver({ flaky });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run5');

    expect(state.status).toBe('succeeded');
    expect(state.nodes.a?.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('emits node.retrying events with increasing attempt numbers', async () => {
    let calls = 0;
    const flaky: NodeRunner = async () => {
      calls += 1;
      if (calls < 3) throw new Error('nope');
      return { main: [] };
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-retry-events',
      name: 'retry-events',
      nodes: [{ id: 'a', type: 'flaky', params: {}, retry: { maxAttempts: 4, backoff: 'fixed', baseDelayMs: 5 } }],
      edges: [],
    };
    const resolver = new TestResolver({ flaky });
    const events: RunEvent[] = [];
    const bus = new RunEventBus();
    bus.subscribe((e) => events.push(e));
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    await executor.run('run6', [{}], bus);

    const retries = events.filter((e) => e.kind === 'node.retrying');
    expect(retries.map((e) => (e as { attempt: number }).attempt)).toEqual([1, 2]);
  });

  it('fails the run once a node exhausts its retry budget, and skips downstream', async () => {
    const alwaysFails: NodeRunner = async () => {
      throw new Error('permanent failure');
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-fail',
      name: 'fail',
      nodes: [
        { id: 'a', type: 'boom', params: {}, retry: { maxAttempts: 2, backoff: 'fixed', baseDelayMs: 1 } },
        { id: 'b', type: 'pass', params: {} },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const resolver = new TestResolver({ boom: alwaysFails, pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run7');

    expect(state.status).toBe('failed');
    expect(state.nodes.a?.status).toBe('failed');
    expect(state.nodes.a?.error).toContain('permanent failure');
    expect(state.nodes.b?.status).toBe('skipped');
  });

  it('continueOnFail lets the run succeed despite a failed node, which still yields no downstream data', async () => {
    const alwaysFails: NodeRunner = async () => {
      throw new Error('expected failure');
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-continue',
      name: 'continue',
      nodes: [
        { id: 'a', type: 'boom', params: {}, continueOnFail: true, retry: { maxAttempts: 1, backoff: 'fixed', baseDelayMs: 0 } },
        { id: 'b', type: 'pass', params: {} },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const resolver = new TestResolver({ boom: alwaysFails, pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run8');

    expect(state.status).toBe('succeeded');
    expect(state.nodes.a?.status).toBe('failed');
    expect(state.nodes.b?.status).toBe('skipped');
  });

  it('fails clearly when a node type has no registered runner', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-missing-type',
      name: 'missing',
      nodes: [{ id: 'a', type: 'does-not-exist', params: {} }],
      edges: [],
    };
    const resolver = new TestResolver({});
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run9');

    expect(state.status).toBe('failed');
    expect(state.nodes.a?.error).toMatch(/no node runner registered/);
  });
});

describe('WorkflowExecutor — node metadata', () => {
  it('is completely ignored by execution — present or absent, behaviour is identical', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-metadata',
      name: 'metadata',
      nodes: [{ id: 'a', type: 'pass', params: {}, metadata: { x: 240, y: 80, note: 'editor-only' } }],
      edges: [],
    };
    const resolver = new TestResolver({ pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run-metadata', [{ v: 1 }]);

    expect(state.status).toBe('succeeded');
    expect(state.nodes.a?.output?.main).toEqual([{ v: 1 }]);
  });
});

describe('WorkflowExecutor — disabled nodes', () => {
  it('a disabled node passes its main input through unchanged and is not run', async () => {
    const spy = vi.fn(async () => ({ main: [{ should: 'not appear' }] }));
    const workflow: WorkflowDefinition = {
      id: 'wf-disabled',
      name: 'disabled',
      nodes: [
        { id: 'a', type: 'produce', params: {} },
        { id: 'b', type: 'spy', params: {}, disabled: true },
        { id: 'c', type: 'pass', params: {} },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    };
    const resolver = new TestResolver({
      produce: async () => ({ main: [{ real: true }] }),
      spy,
      pass: passThrough,
    });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const state = await executor.run('run10');

    expect(spy).not.toHaveBeenCalled();
    expect(state.nodes.c?.output?.main).toEqual([{ real: true }]);
  });
});

describe('WorkflowExecutor — concurrency', () => {
  it('respects a concurrency limit of 1 by never overlapping two nodes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const track: NodeRunner = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { main: [] };
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-concurrency',
      name: 'concurrency',
      nodes: [
        { id: 'a', type: 'track', params: {} },
        { id: 'b', type: 'track', params: {} },
        { id: 'c', type: 'track', params: {} },
      ],
      edges: [],
    };
    const resolver = new TestResolver({ track });
    const executor = new WorkflowExecutor(workflow, { ...testOptions(resolver), concurrency: 1 });
    await executor.run('run11');

    expect(maxInFlight).toBe(1);
  });

  it('runs independent nodes in parallel when concurrency allows it', async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    const track: NodeRunner = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { main: [] };
    };
    const workflow: WorkflowDefinition = {
      id: 'wf-parallel',
      name: 'parallel',
      nodes: [
        { id: 'a', type: 'track', params: {} },
        { id: 'b', type: 'track', params: {} },
      ],
      edges: [],
    };
    const resolver = new TestResolver({ track });
    const executor = new WorkflowExecutor(workflow, { ...testOptions(resolver), concurrency: 4 });
    await executor.run('run12');

    expect(maxInFlight).toBe(2);
  });
});

describe('WorkflowExecutor — partial execution / resume', () => {
  it('does not re-run nodes that already succeeded', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-resume',
      name: 'resume',
      nodes: [
        { id: 'a', type: 'pass', params: {} },
        { id: 'b', type: 'pass', params: {} },
        { id: 'c', type: 'pass', params: {} },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    };
    const resolver = new TestResolver({ pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const full = await executor.run('run13', [{ v: 1 }]);
    expect(resolver.calls).toEqual(['a', 'b', 'c']);

    // Simulate a crash: node "c" never got to run.
    const crashed = { ...full, status: 'running' as const, nodes: { ...full.nodes, c: { status: 'pending' as const, attempts: 0 } } };

    const resolver2 = new TestResolver({ pass: passThrough });
    const executor2 = new WorkflowExecutor(workflow, testOptions(resolver2));
    const resumed = await executor2.resume(crashed, [{ v: 1 }]);

    expect(resumed.status).toBe('succeeded');
    // Only "c" should have actually run on the resumed executor — "a" and "b" are reused.
    expect(resolver2.calls).toEqual(['c']);
    expect(resumed.nodes.c?.output?.main).toEqual([{ v: 1 }]);
  });

  it('resets a node that was mid-flight (crash during execution) back to a fresh attempt', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-resume-running',
      name: 'resume-running',
      nodes: [{ id: 'a', type: 'pass', params: {} }],
      edges: [],
    };
    const crashed = {
      runId: 'run14',
      workflowId: 'wf-resume-running',
      status: 'running' as const,
      startedAt: new Date().toISOString(),
      nodes: { a: { status: 'running' as const, attempts: 1, startedAt: new Date().toISOString() } },
    };
    const resolver = new TestResolver({ pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const resumed = await executor.resume(crashed, [{ v: 'x' }]);

    expect(resumed.status).toBe('succeeded');
    expect(resumed.nodes.a?.output?.main).toEqual([{ v: 'x' }]);
  });
});

describe('WorkflowExecutor — cancellation', () => {
  it('marks all pending nodes cancelled when the signal is already aborted', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-cancel',
      name: 'cancel',
      nodes: [{ id: 'a', type: 'pass', params: {} }],
      edges: [],
    };
    const resolver = new TestResolver({ pass: passThrough });
    const executor = new WorkflowExecutor(workflow, testOptions(resolver));
    const controller = new AbortController();
    controller.abort();
    const state = await executor.run('run15', [{}], new RunEventBus(), controller.signal);

    expect(state.status).toBe('cancelled');
    expect(state.nodes.a?.status).toBe('cancelled');
    expect(resolver.calls).toEqual([]);
  });
});
