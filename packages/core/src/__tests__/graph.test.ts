import { describe, it, expect } from 'vitest';
import { compileGraph, findRootNodes, GraphValidationError } from '../graph.js';
import type { WorkflowDefinition } from '../types.js';

function workflow(overrides: Partial<WorkflowDefinition>): WorkflowDefinition {
  return { id: 'wf', name: 'test', nodes: [], edges: [], ...overrides };
}

describe('compileGraph', () => {
  it('produces a topological order for a linear chain', () => {
    const graph = compileGraph(
      workflow({
        nodes: [{ id: 'c', type: 't', params: {} }, { id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      }),
    );
    expect(graph.order.indexOf('a')).toBeLessThan(graph.order.indexOf('b'));
    expect(graph.order.indexOf('b')).toBeLessThan(graph.order.indexOf('c'));
  });

  it('is deterministic across repeated compiles of the same graph', () => {
    const def = workflow({
      nodes: [
        { id: 'a', type: 't', params: {} },
        { id: 'b', type: 't', params: {} },
        { id: 'c', type: 't', params: {} },
        { id: 'd', type: 't', params: {} },
      ],
      edges: [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }],
    });
    const first = compileGraph(def).order;
    const second = compileGraph(def).order;
    expect(second).toEqual(first);
  });

  it('rejects duplicate node ids', () => {
    expect(() =>
      compileGraph(
        workflow({
          nodes: [{ id: 'a', type: 't', params: {} }, { id: 'a', type: 't', params: {} }],
        }),
      ),
    ).toThrow(GraphValidationError);
  });

  it('rejects an edge referencing a missing source node', () => {
    expect(() =>
      compileGraph(
        workflow({
          nodes: [{ id: 'a', type: 't', params: {} }],
          edges: [{ from: 'missing', to: 'a' }],
        }),
      ),
    ).toThrow(/unknown source node/);
  });

  it('rejects an edge referencing a missing target node', () => {
    expect(() =>
      compileGraph(
        workflow({
          nodes: [{ id: 'a', type: 't', params: {} }],
          edges: [{ from: 'a', to: 'missing' }],
        }),
      ),
    ).toThrow(/unknown target node/);
  });

  it('rejects a two-node cycle', () => {
    expect(() =>
      compileGraph(
        workflow({
          nodes: [{ id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }],
          edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
        }),
      ),
    ).toThrow(/cycle/);
  });

  it('rejects a self-loop', () => {
    expect(() =>
      compileGraph(
        workflow({
          nodes: [{ id: 'a', type: 't', params: {} }],
          edges: [{ from: 'a', to: 'a' }],
        }),
      ),
    ).toThrow(/cycle/);
  });

  it('accepts a diamond (fan-out then merge)', () => {
    const graph = compileGraph(
      workflow({
        nodes: [
          { id: 'start', type: 't', params: {} },
          { id: 'left', type: 't', params: {} },
          { id: 'right', type: 't', params: {} },
          { id: 'merge', type: 't', params: {} },
        ],
        edges: [
          { from: 'start', to: 'left' },
          { from: 'start', to: 'right' },
          { from: 'left', to: 'merge' },
          { from: 'right', to: 'merge' },
        ],
      }),
    );
    expect(graph.order).toHaveLength(4);
    expect(graph.order.indexOf('merge')).toBe(3);
  });
});

describe('findRootNodes', () => {
  it('returns only nodes with no incoming edges', () => {
    const graph = compileGraph(
      workflow({
        nodes: [{ id: 'a', type: 't', params: {} }, { id: 'b', type: 't', params: {} }, { id: 'c', type: 't', params: {} }],
        edges: [{ from: 'a', to: 'b' }],
      }),
    );
    expect(findRootNodes(graph).sort()).toEqual(['a', 'c']);
  });
});
