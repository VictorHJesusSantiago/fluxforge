import type { Edge, NodeInstance, WorkflowDefinition } from '@fluxforge/core';

/**
 * Pure, immutable edits to a `WorkflowDefinition` — every function returns a new object rather
 * than mutating its argument, so the editor's undo stack (`history.ts`) can just keep a list of
 * these snapshots with no separate command/inverse-command bookkeeping. This is the same
 * trade-off NovaForge's own editor made for its command stack, and it holds here for the same
 * reason: a workflow document is small (dozens of nodes, not thousands), so cloning it per edit
 * is cheap enough that the simplicity is worth more than the allocation.
 */

export function addNode(workflow: WorkflowDefinition, node: NodeInstance): WorkflowDefinition {
  return { ...workflow, nodes: [...workflow.nodes, node] };
}

/** Removes a node and every edge touching it — an edge left dangling on a deleted node id is a broken workflow, not a valid one. */
export function removeNode(workflow: WorkflowDefinition, nodeId: string): WorkflowDefinition {
  return {
    ...workflow,
    nodes: workflow.nodes.filter((n) => n.id !== nodeId),
    edges: workflow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function moveNode(workflow: WorkflowDefinition, nodeId: string, x: number, y: number): WorkflowDefinition {
  return {
    ...workflow,
    nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, metadata: { ...n.metadata, x, y } } : n)),
  };
}

export function updateNodeParams(
  workflow: WorkflowDefinition,
  nodeId: string,
  params: Record<string, unknown>,
): WorkflowDefinition {
  return { ...workflow, nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, params } : n)) };
}

export function setNodeDisabled(workflow: WorkflowDefinition, nodeId: string, disabled: boolean): WorkflowDefinition {
  return { ...workflow, nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, disabled } : n)) };
}

/**
 * Adds an edge — unless one already connects the exact same four coordinates (source node+port
 * to target node+port), which is a no-op rather than a duplicate, since two identical edges
 * would double-deliver every item without the user ever having asked for that.
 */
export function addEdge(workflow: WorkflowDefinition, edge: Edge): WorkflowDefinition {
  const exists = workflow.edges.some(
    (e) =>
      e.from === edge.from &&
      e.to === edge.to &&
      (e.fromPort ?? 'main') === (edge.fromPort ?? 'main') &&
      (e.toPort ?? 'main') === (edge.toPort ?? 'main'),
  );
  if (exists) return workflow;
  return { ...workflow, edges: [...workflow.edges, edge] };
}

export function removeEdge(workflow: WorkflowDefinition, index: number): WorkflowDefinition {
  return { ...workflow, edges: workflow.edges.filter((_, i) => i !== index) };
}

/** A fresh, empty workflow — what "New" in the editor starts from. */
export function emptyWorkflow(id: string, name: string): WorkflowDefinition {
  return { id, name, nodes: [], edges: [] };
}
