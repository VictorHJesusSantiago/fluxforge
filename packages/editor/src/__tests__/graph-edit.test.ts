import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition } from '@fluxforge/core';
import {
  addNode,
  removeNode,
  moveNode,
  updateNodeParams,
  setNodeDisabled,
  addEdge,
  removeEdge,
  emptyWorkflow,
} from '../graph-edit.js';

function wf(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return { id: 'wf', name: 'test', nodes: [], edges: [], ...overrides };
}

describe('addNode / removeNode', () => {
  it('addNode appends without mutating the original', () => {
    const original = wf();
    const updated = addNode(original, { id: 'a', type: 't', params: {} });
    expect(original.nodes).toHaveLength(0);
    expect(updated.nodes).toHaveLength(1);
  });

  it('removeNode also removes every edge touching it', () => {
    const workflow = wf({
      nodes: [{ id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }, { id: 'c', type: 't', params: {} }],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    });
    const updated = removeNode(workflow, 'b');
    expect(updated.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(updated.edges).toEqual([]);
  });

  it('removeNode leaves unrelated edges alone', () => {
    const workflow = wf({
      nodes: [{ id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }, { id: 'c', type: 't', params: {} }],
      edges: [{ from: 'a', to: 'c' }],
    });
    const updated = removeNode(workflow, 'b');
    expect(updated.edges).toEqual([{ from: 'a', to: 'c' }]);
  });
});

describe('moveNode', () => {
  it('stores position in metadata without touching params', () => {
    const workflow = wf({ nodes: [{ id: 'a', type: 't', params: { keep: true } }] });
    const updated = moveNode(workflow, 'a', 120, 340);
    expect(updated.nodes[0]?.metadata).toEqual({ x: 120, y: 340 });
    expect(updated.nodes[0]?.params).toEqual({ keep: true });
  });

  it('preserves other metadata keys already present', () => {
    const workflow = wf({ nodes: [{ id: 'a', type: 't', params: {}, metadata: { note: 'hi' } }] });
    const updated = moveNode(workflow, 'a', 5, 5);
    expect(updated.nodes[0]?.metadata).toEqual({ note: 'hi', x: 5, y: 5 });
  });
});

describe('updateNodeParams', () => {
  it('replaces a node\'s params entirely', () => {
    const workflow = wf({ nodes: [{ id: 'a', type: 't', params: { old: 1 } }] });
    const updated = updateNodeParams(workflow, 'a', { new: 2 });
    expect(updated.nodes[0]?.params).toEqual({ new: 2 });
  });
});

describe('setNodeDisabled', () => {
  it('toggles the disabled flag on the right node only', () => {
    const workflow = wf({ nodes: [{ id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }] });
    const updated = setNodeDisabled(workflow, 'a', true);
    expect(updated.nodes.find((n) => n.id === 'a')?.disabled).toBe(true);
    expect(updated.nodes.find((n) => n.id === 'b')?.disabled).toBeUndefined();
  });
});

describe('addEdge / removeEdge', () => {
  it('adds a new edge', () => {
    const updated = addEdge(wf(), { from: 'a', to: 'b' });
    expect(updated.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('does not add a duplicate of an identical edge (same ports)', () => {
    const workflow = wf({ edges: [{ from: 'a', to: 'b', fromPort: 'main', toPort: 'main' }] });
    const updated = addEdge(workflow, { from: 'a', to: 'b' });
    expect(updated.edges).toHaveLength(1);
  });

  it('does add a second edge between the same nodes on a different port', () => {
    const workflow = wf({ edges: [{ from: 'a', to: 'b', fromPort: 'true' }] });
    const updated = addEdge(workflow, { from: 'a', to: 'b', fromPort: 'false' });
    expect(updated.edges).toHaveLength(2);
  });

  it('removeEdge removes by index', () => {
    const workflow = wf({ edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] });
    const updated = removeEdge(workflow, 0);
    expect(updated.edges).toEqual([{ from: 'b', to: 'c' }]);
  });
});

describe('emptyWorkflow', () => {
  it('produces a valid, empty workflow', () => {
    const workflow = emptyWorkflow('id-1', 'Untitled');
    expect(workflow).toEqual({ id: 'id-1', name: 'Untitled', nodes: [], edges: [] });
  });
});
