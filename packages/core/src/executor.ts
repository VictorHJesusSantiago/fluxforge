import { calculateBackoffDelay } from './backoff.js';
import { compileGraph, type CompiledGraph } from './graph.js';
import { RunEventBus } from './events.js';
import {
  DEFAULT_RETRY_POLICY,
  type NodeExecutionContext,
  type NodeInstance,
  type NodeLogger,
  type NodeRunnerResolver,
  type NodeRunState,
  type PortItems,
  type RunState,
  type WorkflowDefinition,
  type WorkflowItem,
} from './types.js';

export interface ExecutorOptions {
  resolver: NodeRunnerResolver;
  /** How many nodes may run at once. A DAG's independent branches are where this matters. */
  concurrency?: number;
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  makeLogger?: (nodeId: string) => NodeLogger;
}

const NOOP_LOGGER: NodeLogger = { info() {}, warn() {}, error() {} };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a `WorkflowDefinition` to completion (or partial completion, on cancel/abort), producing
 * a `RunState` that is both the result and — handed back into `resume()` — the checkpoint a
 * crashed or cancelled run continues from.
 *
 * **How branch skipping falls out for free.** There is no special case for an if/switch node
 * anywhere in this file. A node becomes eligible to run once every node it depends on has
 * reached a terminal status; it gathers items only from `succeeded` predecessors (a `failed` or
 * `skipped` predecessor contributes nothing). If that gathering produces zero items on every
 * port for a *non-root* node, the node is marked `skipped` instead of run. A branch node's own
 * runtime (in `@fluxforge/registry`'s node implementations, not here) simply emits items on one
 * output port and nothing on the other — the empty-input skip rule above is what turns that into
 * the whole unreached branch, and everything downstream of it, being skipped in cascade. One
 * generic rule, not a `NodeKind.Branch` special case.
 */
export class WorkflowExecutor {
  private readonly graph: CompiledGraph;
  private readonly concurrency: number;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly makeLogger: (nodeId: string) => NodeLogger;

  constructor(
    private readonly workflow: WorkflowDefinition,
    private readonly options: ExecutorOptions,
  ) {
    this.graph = compileGraph(workflow);
    this.concurrency = options.concurrency ?? 4;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
    this.makeLogger = options.makeLogger ?? (() => NOOP_LOGGER);
  }

  /** Start a fresh run. `initialInput` seeds every root (no-incoming-edge) node's `main` port. */
  async run(
    runId: string,
    initialInput: WorkflowItem[] = [{}],
    events: RunEventBus = new RunEventBus(),
    signal: AbortSignal = new AbortController().signal,
  ): Promise<RunState> {
    return this.execute(runId, initialInput, undefined, events, signal);
  }

  /**
   * Continue a run from a prior `RunState` — the partial-execution requirement. Nodes already
   * `succeeded` or `skipped` are not re-run; their recorded output is reused as-is. Nodes that
   * were `running` (the process died mid-node) or `failed` are reset to `pending` and re-attempted
   * from attempt 1 — a crash is not a retry-budget-consuming failure of the node itself.
   */
  async resume(
    previous: RunState,
    initialInput: WorkflowItem[] = [{}],
    events: RunEventBus = new RunEventBus(),
    signal: AbortSignal = new AbortController().signal,
  ): Promise<RunState> {
    return this.execute(previous.runId, initialInput, previous, events, signal);
  }

  private async execute(
    runId: string,
    initialInput: WorkflowItem[],
    resumeFrom: RunState | undefined,
    events: RunEventBus,
    signal: AbortSignal,
  ): Promise<RunState> {
    const nodeStates = new Map<string, NodeRunState>();
    for (const id of this.graph.nodesById.keys()) {
      const previous = resumeFrom?.nodes[id];
      if (previous?.status === 'succeeded' || previous?.status === 'skipped') {
        nodeStates.set(id, previous);
      } else {
        nodeStates.set(id, { status: 'pending', attempts: 0 });
      }
    }

    const state: RunState = {
      runId,
      workflowId: this.workflow.id,
      status: 'running',
      nodes: Object.fromEntries(nodeStates),
      startedAt: resumeFrom?.startedAt ?? this.now().toISOString(),
    };

    events.emit({ kind: 'run.started', runId, workflowId: this.workflow.id, at: state.startedAt });

    const rootIds = new Set(
      this.graph.order.filter((id) => (this.graph.incoming.get(id) ?? []).length === 0),
    );

    let failedNonRecoverable = false;
    const running = new Set<Promise<void>>();

    const isTerminal = (id: string) => {
      const status = nodeStates.get(id)!.status;
      return status === 'succeeded' || status === 'failed' || status === 'skipped' || status === 'cancelled';
    };

    const isReady = (id: string) =>
      nodeStates.get(id)!.status === 'pending' &&
      (this.graph.incoming.get(id) ?? []).every((edge) => isTerminal(edge.from));

    const gatherInput = (node: NodeInstance): PortItems => {
      if (rootIds.has(node.id)) return { main: initialInput };
      const input: PortItems = {};
      for (const edge of this.graph.incoming.get(node.id) ?? []) {
        const source = nodeStates.get(edge.from)!;
        if (source.status !== 'succeeded' || source.output === undefined) continue;
        const items = source.output[edge.fromPort ?? 'main'] ?? [];
        const port = edge.toPort ?? 'main';
        input[port] = [...(input[port] ?? []), ...items];
      }
      return input;
    };

    const totalItemCount = (ports: PortItems): number =>
      Object.values(ports).reduce((sum, items) => sum + items.length, 0);

    const runOneNode = async (node: NodeInstance): Promise<void> => {
      const at = this.now().toISOString();
      const input = gatherInput(node);

      if (!rootIds.has(node.id) && totalItemCount(input) === 0) {
        nodeStates.set(node.id, { status: 'skipped', attempts: 0, finishedAt: at });
        events.emit({ kind: 'node.skipped', runId, nodeId: node.id, reason: 'no input items', at });
        return;
      }

      if (node.disabled) {
        // A disabled node passes its input straight through on `main` — useful for temporarily
        // no-op-ing a step in the editor without rewiring every edge around it.
        nodeStates.set(node.id, {
          status: 'succeeded',
          attempts: 0,
          output: { main: input.main ?? [] },
          finishedAt: at,
        });
        return;
      }

      const runner = this.options.resolver.resolve(node.type);
      if (runner === undefined) {
        nodeStates.set(node.id, {
          status: 'failed',
          attempts: 1,
          error: `no node runner registered for type "${node.type}"`,
          finishedAt: this.now().toISOString(),
        });
        failedNonRecoverable = failedNonRecoverable || !node.continueOnFail;
        events.emit({
          kind: 'node.failed',
          runId,
          nodeId: node.id,
          error: `no node runner registered for type "${node.type}"`,
          at,
        });
        return;
      }

      const policy = node.retry ?? DEFAULT_RETRY_POLICY;
      const priorAttempts = nodeStates.get(node.id)!.attempts;
      let attempt = priorAttempts;

      for (;;) {
        attempt += 1;
        const startedAt = this.now().toISOString();
        nodeStates.set(node.id, { status: 'running', attempts: attempt, startedAt });
        events.emit({ kind: 'node.started', runId, nodeId: node.id, attempt, at: startedAt });

        try {
          const context: NodeExecutionContext = {
            runId,
            nodeId: node.id,
            nodeType: node.type,
            params: node.params,
            input,
            signal,
            logger: this.makeLogger(node.id),
          };
          const output = await runner(context);
          const finishedAt = this.now().toISOString();
          nodeStates.set(node.id, { status: 'succeeded', attempts: attempt, output, finishedAt });
          events.emit({ kind: 'node.succeeded', runId, nodeId: node.id, output, at: finishedAt });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (attempt < policy.maxAttempts && !signal.aborted) {
            const delayMs = calculateBackoffDelay(attempt, policy, this.random);
            events.emit({
              kind: 'node.retrying',
              runId,
              nodeId: node.id,
              attempt,
              delayMs,
              error: message,
              at: this.now().toISOString(),
            });
            await this.sleep(delayMs);
            continue;
          }

          const finishedAt = this.now().toISOString();
          nodeStates.set(node.id, { status: 'failed', attempts: attempt, error: message, finishedAt });
          events.emit({ kind: 'node.failed', runId, nodeId: node.id, error: message, at: finishedAt });
          failedNonRecoverable = failedNonRecoverable || !node.continueOnFail;
          return;
        }
      }
    };

    while (true) {
      if (signal.aborted) {
        for (const id of this.graph.nodesById.keys()) {
          if (nodeStates.get(id)!.status === 'pending') {
            nodeStates.set(id, { status: 'cancelled', attempts: 0 });
          }
        }
        break;
      }

      const pendingIds = this.graph.order.filter((id) => nodeStates.get(id)!.status === 'pending');
      if (pendingIds.length === 0 && running.size === 0) break;

      const readyIds = pendingIds.filter(isReady);
      for (const id of readyIds) {
        if (running.size >= this.concurrency) break;
        const node = this.graph.nodesById.get(id)!;
        // Claim it immediately (not just after the async work starts) so a second pass through
        // this loop before the microtask queue drains cannot schedule the same node twice.
        nodeStates.set(id, { status: 'running', attempts: nodeStates.get(id)!.attempts });
        const task = runOneNode(node).finally(() => {
          running.delete(task);
        });
        running.add(task);
      }

      if (running.size === 0) {
        // Nothing ready and nothing running, but pending nodes remain — every remaining node is
        // waiting on something that will never finish (a dependency itself stuck pending, which
        // `compileGraph`'s cycle check already rules out) or, more mundanely, is genuinely stuck
        // because everything it depends on already failed/skipped and it still shows pending —
        // this only happens if `isReady` and `isTerminal` disagree, which would be a bug in this
        // file, not a legitimate workflow state. Fail loudly rather than spin forever.
        throw new Error(
          `WorkflowExecutor: deadlock — ${pendingIds.length} node(s) pending with none ready and none running`,
        );
      }

      await Promise.race(running);
    }

    state.nodes = Object.fromEntries(nodeStates);
    state.finishedAt = this.now().toISOString();
    if (signal.aborted) {
      state.status = 'cancelled';
      events.emit({ kind: 'run.cancelled', runId, at: state.finishedAt });
    } else if (failedNonRecoverable) {
      state.status = 'failed';
      events.emit({ kind: 'run.failed', runId, at: state.finishedAt, error: 'one or more nodes failed' });
    } else {
      state.status = 'succeeded';
      events.emit({ kind: 'run.succeeded', runId, at: state.finishedAt });
    }

    return state;
  }
}
