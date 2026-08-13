import type { Edge, NodeInstance, WorkflowDefinition } from './types.js';

export class GraphValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphValidationError';
  }
}

/** A workflow's edges and nodes, indexed for O(1) lookups the executor needs every step. */
export interface CompiledGraph {
  nodesById: Map<string, NodeInstance>;
  /** Edges whose `to` is this node id — what a node needs to have arrived before it can run. */
  incoming: Map<string, Edge[]>;
  /** Edges whose `from` is this node id — who to wake up once this node finishes. */
  outgoing: Map<string, Edge[]>;
  /** Topological order — index in this array is a valid execution order (not the only one). */
  order: string[];
}

/**
 * Validates and indexes a workflow definition once per run, so the executor's hot path is map
 * lookups, not array scans. Throws on: duplicate node ids, an edge referencing a missing node,
 * or a cycle — a workflow is a DAG by definition (SPEC "Graph shape"); loops are a node type
 * (a batch/loop node that iterates internally and emits multiple times), never a graph cycle,
 * because a cyclic graph has no well-defined topological execution order for retries/resume to
 * reason about.
 */
export function compileGraph(workflow: WorkflowDefinition): CompiledGraph {
  const nodesById = new Map<string, NodeInstance>();
  for (const node of workflow.nodes) {
    if (nodesById.has(node.id)) {
      throw new GraphValidationError(`duplicate node id "${node.id}"`);
    }
    nodesById.set(node.id, node);
  }

  const incoming = new Map<string, Edge[]>();
  const outgoing = new Map<string, Edge[]>();
  for (const id of nodesById.keys()) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }

  for (const edge of workflow.edges) {
    if (!nodesById.has(edge.from)) {
      throw new GraphValidationError(`edge references unknown source node "${edge.from}"`);
    }
    if (!nodesById.has(edge.to)) {
      throw new GraphValidationError(`edge references unknown target node "${edge.to}"`);
    }
    incoming.get(edge.to)!.push(edge);
    outgoing.get(edge.from)!.push(edge);
  }

  const order = topologicalSort(nodesById, outgoing);

  return { nodesById, incoming, outgoing, order };
}

/**
 * Kahn's algorithm, chosen over DFS specifically because a leftover non-empty queue-vs-visited
 * mismatch at the end is a direct, cheap cycle certificate (no separate DFS-colouring pass
 * needed to name the offending nodes).
 */
function topologicalSort(
  nodesById: Map<string, NodeInstance>,
  outgoing: Map<string, Edge[]>,
): string[] {
  const inDegree = new Map<string, number>();
  for (const id of nodesById.keys()) inDegree.set(id, 0);
  for (const edges of outgoing.values()) {
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const next: string[] = [];
    for (const edge of outgoing.get(id) ?? []) {
      const remaining = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, remaining);
      if (remaining === 0) next.push(edge.to);
    }
    next.sort();
    queue.push(...next);
  }

  if (order.length !== nodesById.size) {
    const stuck = [...nodesById.keys()].filter((id) => !order.includes(id));
    throw new GraphValidationError(`workflow graph has a cycle involving: ${stuck.join(', ')}`);
  }

  return order;
}

/** Every node with no incoming edges — where a run actually begins. */
export function findRootNodes(graph: CompiledGraph): string[] {
  return graph.order.filter((id) => (graph.incoming.get(id) ?? []).length === 0);
}
