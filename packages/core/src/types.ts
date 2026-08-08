/**
 * The data unit that flows along an edge. Modelled as a JSON-serialisable record (n8n calls
 * this an "item") rather than an opaque blob, so a merge node can inspect fields, a filter node
 * can test a predicate, and the whole run can be persisted as JSON for partial-execution resume
 * without a custom serialiser per node type.
 */
export type WorkflowItem = Record<string, unknown>;

/** A named bundle of items on one port. A node can have several inputs/outputs (e.g. `main`, `error`). */
export type PortItems = Record<string, WorkflowItem[]>;

export type BackoffKind = 'fixed' | 'exponential';

export interface RetryPolicy {
  /** Total attempts including the first — 1 means "no retry." */
  maxAttempts: number;
  backoff: BackoffKind;
  baseDelayMs: number;
  maxDelayMs?: number;
  /** Full jitter (Marc Brooker's "AWS Architecture Blog" algorithm) — smooths retry storms. */
  jitter?: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  backoff: 'fixed',
  baseDelayMs: 0,
};

export interface NodeInstance {
  /** Unique within the workflow. Referenced by edges and by `RunState`. */
  id: string;
  /** A registry key like `"http.request"` — the core has no idea what this does. */
  type: string;
  /** Opaque to the executor; handed to whatever `NodeRunner` resolves for `type`. */
  params: Record<string, unknown>;
  retry?: RetryPolicy;
  /** If true, a failure here does not fail the run — downstream nodes just see no `main` items. */
  continueOnFail?: boolean;
  disabled?: boolean;
  /**
   * Free-form, ignored entirely by `WorkflowExecutor` — a place for tooling (the editor's canvas
   * position, a note, a colour) to ride along in the same saved document without the executor
   * needing to know any of that exists. Keeping it a separate bag from `params` matters: `params`
   * is validated against the node's own schema (see `@fluxforge/sdk`'s `validateParams`), and a
   * stray `{x: 240}` the editor left behind must never fail that validation.
   */
  metadata?: Record<string, unknown>;
}

export interface Edge {
  from: string;
  to: string;
  /** Defaults to `"main"`. A branch node might emit on `"true"`/`"false"` instead. */
  fromPort?: string;
  toPort?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: NodeInstance[];
  edges: Edge[];
}

export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface NodeRunState {
  status: NodeRunStatus;
  attempts: number;
  /** Present once `status` is `succeeded` — what this node produced, per output port. */
  output?: PortItems;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * A full snapshot of one execution. This is exactly what `WorkflowExecutor.resume` needs and
 * exactly what a queue worker would persist after every node completes — the "partial
 * execution" requirement is `resume(state)` finding every `succeeded` node and not re-running it.
 */
export interface RunState {
  runId: string;
  workflowId: string;
  status: RunStatus;
  nodes: Record<string, NodeRunState>;
  startedAt: string;
  finishedAt?: string;
}

export interface NodeExecutionContext {
  runId: string;
  nodeId: string;
  nodeType: string;
  params: Record<string, unknown>;
  /** Items received on each input port, already merged across every edge that targets it. */
  input: PortItems;
  signal: AbortSignal;
  logger: NodeLogger;
}

export interface NodeLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** What a node runtime actually does. Registered per `type` string; core never imports one. */
export type NodeRunner = (context: NodeExecutionContext) => Promise<PortItems>;

/** Resolves a node's `type` to the function that runs it. Implemented by `@fluxforge/registry`. */
export interface NodeRunnerResolver {
  resolve(nodeType: string): NodeRunner | undefined;
}

export type RunEvent =
  | { kind: 'run.started'; runId: string; workflowId: string; at: string }
  | { kind: 'run.succeeded'; runId: string; at: string }
  | { kind: 'run.failed'; runId: string; at: string; error: string }
  | { kind: 'run.cancelled'; runId: string; at: string }
  | { kind: 'node.started'; runId: string; nodeId: string; attempt: number; at: string }
  | { kind: 'node.succeeded'; runId: string; nodeId: string; output: PortItems; at: string }
  | {
      kind: 'node.retrying';
      runId: string;
      nodeId: string;
      attempt: number;
      delayMs: number;
      error: string;
      at: string;
    }
  | { kind: 'node.failed'; runId: string; nodeId: string; error: string; at: string }
  | { kind: 'node.skipped'; runId: string; nodeId: string; reason: string; at: string };

export type RunEventListener = (event: RunEvent) => void;
