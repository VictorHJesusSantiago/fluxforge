import { describe, it, expect } from 'vitest';
import { computeNodeLayout, bezierControlOffset, cubicBezierPoint } from '../layout.js';
import { hitTestEdge, hitTestNodeBody, hitTestPort } from '../hit-test.js';

const layoutA = computeNodeLayout({ id: 'a', x: 0, y: 0 }, [{ id: 'main', label: 'In' }], [{ id: 'main', label: 'Out' }]);
const layoutB = computeNodeLayout({ id: 'b', x: 300, y: 0 }, [{ id: 'main', label: 'In' }], [{ id: 'main', label: 'Out' }]);

describe('hitTestNodeBody', () => {
  it('finds the node whose bounding box contains the point', () => {
    expect(hitTestNodeBody([layoutA, layoutB], { x: 50, y: 30 })).toBe('a');
    expect(hitTestNodeBody([layoutA, layoutB], { x: 350, y: 30 })).toBe('b');
  });

  it('returns undefined for empty space', () => {
    expect(hitTestNodeBody([layoutA, layoutB], { x: 200, y: 30 })).toBeUndefined();
  });

  it('prefers the later (topmost-drawn) node when two overlap', () => {
    const overlapping = computeNodeLayout({ id: 'c', x: 0, y: 0 }, [{ id: 'main', label: 'In' }], [{ id: 'main', label: 'Out' }]);
    expect(hitTestNodeBody([layoutA, overlapping], { x: 50, y: 30 })).toBe('c');
  });
});

describe('hitTestPort', () => {
  it('finds an output port near the click point', () => {
    const port = layoutA.outputs[0]!;
    const hit = hitTestPort([layoutA, layoutB], { x: port.x + 2, y: port.y - 1 });
    expect(hit).toEqual({ nodeId: 'a', portId: 'main', kind: 'output', x: port.x, y: port.y });
  });

  it('finds an input port near the click point', () => {
    const port = layoutB.inputs[0]!;
    const hit = hitTestPort([layoutA, layoutB], { x: port.x, y: port.y });
    expect(hit?.nodeId).toBe('b');
    expect(hit?.kind).toBe('input');
  });

  it('returns undefined when the click is outside every port\'s hit radius', () => {
    expect(hitTestPort([layoutA, layoutB], { x: 150, y: 150 })).toBeUndefined();
  });

  it('prefers a port over a node body when both are technically under the point', () => {
    const port = layoutA.outputs[0]!;
    const hit = hitTestPort([layoutA], { x: port.x, y: port.y });
    expect(hit).not.toBeUndefined();
  });
});

describe('hitTestEdge', () => {
  const edges = [{ from: 'a', to: 'b' }];

  it('finds an edge when the point sits exactly on its curve midpoint', () => {
    const from = layoutA.outputs[0]!;
    const to = layoutB.inputs[0]!;
    const offset = bezierControlOffset(from.x, to.x);
    const cp1 = { x: from.x + offset, y: from.y };
    const cp2 = { x: to.x - offset, y: to.y };
    const midpoint = cubicBezierPoint(from, cp1, cp2, to, 0.5);

    expect(hitTestEdge([layoutA, layoutB], edges, midpoint)).toBe(0);
  });

  it('returns undefined far away from any edge', () => {
    expect(hitTestEdge([layoutA, layoutB], edges, { x: 9999, y: 9999 })).toBeUndefined();
  });

  it('returns undefined for a point just outside the tolerance, and finds it just inside', () => {
    const from = layoutA.outputs[0]!;
    const to = layoutB.inputs[0]!;
    const offset = bezierControlOffset(from.x, to.x);
    const cp1 = { x: from.x + offset, y: from.y };
    const cp2 = { x: to.x - offset, y: to.y };
    const midpoint = cubicBezierPoint(from, cp1, cp2, to, 0.5);

    expect(hitTestEdge([layoutA, layoutB], edges, { x: midpoint.x, y: midpoint.y + 20 }, 5)).toBeUndefined();
    expect(hitTestEdge([layoutA, layoutB], edges, { x: midpoint.x, y: midpoint.y + 3 }, 5)).toBe(0);
  });

  it('skips an edge whose endpoint node is not currently laid out, instead of throwing', () => {
    expect(hitTestEdge([layoutA], [{ from: 'a', to: 'missing' }], { x: 0, y: 0 })).toBeUndefined();
  });

  it('prefers the later (topmost-drawn) edge when two overlap', () => {
    const from = layoutA.outputs[0]!;
    const to = layoutB.inputs[0]!;
    const offset = bezierControlOffset(from.x, to.x);
    const cp1 = { x: from.x + offset, y: from.y };
    const cp2 = { x: to.x - offset, y: to.y };
    const midpoint = cubicBezierPoint(from, cp1, cp2, to, 0.5);

    const twoIdenticalEdges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }];
    expect(hitTestEdge([layoutA, layoutB], twoIdenticalEdges, midpoint)).toBe(1);
  });
});
