import { randomUUID } from 'node:crypto';
import { RunEventBus, WorkflowExecutor, type RunState, type WorkflowItem } from '@fluxforge/core';
import type { NodeRegistry } from '@fluxforge/registry';
import type { CredentialResolver } from '@fluxforge/sdk';
import type { RunStore } from './run-store.js';
import type { WorkflowStore } from './workflow-store.js';

/**
 * Ties together everything a run actually needs: the saved workflow definition, the node
 * registry (as a `NodeRunnerResolver`), and persistence of the resulting `RunState`. Deliberately
 * synchronous-feeling — `execute()` awaits the whole run and returns/persists the final state —
 * because the one caller that needs *live* progress (the editor's "Run" button) streams the same
 * `RunEventBus` it passes in over SSE as the run proceeds (see `http.ts`'s streaming endpoint),
 * rather than this service maintaining a separate pub/sub registry keyed by run id. A workflow
 * triggered by a webhook or cron schedule, by contrast, genuinely has no live watcher — it only
 * ever needs the persisted final state, queryable afterward via `RunStore`.
 */
export class ExecutionService {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly runStore: RunStore,
    private readonly workflowStore: WorkflowStore,
    private readonly credentials: CredentialResolver,
  ) {}

  async execute(
    workflowId: string,
    initialInput: WorkflowItem[] = [{}],
    events: RunEventBus = new RunEventBus(),
    signal: AbortSignal = new AbortController().signal,
  ): Promise<RunState> {
    const workflow = this.workflowStore.get(workflowId);
    const executor = new WorkflowExecutor(workflow, { resolver: this.registry.createResolver(this.credentials) });
    const runId = randomUUID();
    const state = await executor.run(runId, initialInput, events, signal);
    this.runStore.save(state);
    return state;
  }

  /** Continues a previously interrupted run — the partial-execution path, surfaced at the HTTP layer. */
  async resume(runId: string, events: RunEventBus = new RunEventBus()): Promise<RunState> {
    const previous = this.runStore.get(runId);
    if (previous === undefined) throw new Error(`no run with id "${runId}"`);
    const workflow = this.workflowStore.get(previous.workflowId);
    const executor = new WorkflowExecutor(workflow, { resolver: this.registry.createResolver(this.credentials) });
    const state = await executor.resume(previous, [{}], events);
    this.runStore.save(state);
    return state;
  }
}
