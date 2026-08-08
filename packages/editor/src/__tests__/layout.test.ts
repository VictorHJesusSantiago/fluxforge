import { describe, it, expect } from 'vitest';
import { computeNodeLayout, bezierControlOffset, cubicBezierPoint, resolveEdgeEndpoints, NODE_WIDTH } from '../layout.js';

describe('computeNodeLayout', () => {
  it('places input ports on the left edge and output ports on the right edge', () => {
    const layout = computeNodeLayout(
      { id: 'a', x: 100, y: 50 },
      [{ id: 'main', label: 'In' }],
      [{ id: 'main', label: 'Out' }],
    );
    expect(layout.inputs[0]?.x).toBe(100);
    expect(layout.outputs[0]?.x).toBe(100 + NODE_WIDTH);
  });

  it('grows taller for a node with more ports on one side', () => {
    const small = computeNodeLayout({ id: 'a', x: 0, y: 0 }, [{ id: 'main', label: 'In' }], [{ id: 'main', label: 'Out' }]);
    const big = computeNodeLayout(
      { id: 'b', x: 0, y: 0 },
      [{ id: 'main', label: 'In' }],
      [
        { id: 'true', label: 'True' },
        { id: 'false', label: 'False' },
        { id: 'other', label: 'Other' },
      ],
    );
    expect(big.height).toBeGreaterThan(small.height);
  });

  it('a trigger node (zero inputs) still lays out without throwing', () => {
    const layout = computeNodeLayout({ id: 'a', x: 0, y: 0 }, [], [{ id: 'main', label: 'Out' }]);
    expect(layout.inputs).toEqual([]);
    expect(layout.outputs).toHaveLength(1);
  });

  it('a sink node (zero outputs) still lays out without throwing', () => {
    const layout = computeNodeLayout({ id: 'a', x: 0, y: 0 }, [{ id: 'main', label: 'In' }], []);
    expect(layout.outputs).toEqual([]);
  });

  it('stacks multiple ports on the same side with consistent vertical spacing', () => {
    const layout = computeNodeLayout(
      { id: 'a', x: 0, y: 0 },
      [],
      [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    );
    const gaps = [layout.outputs[1]!.y - layout.outputs[0]!.y, layout.outputs[2]!.y - layout.outputs[1]!.y];
    expect(gaps[0]).toBe(gaps[1]);
  });
});

describe('bezierControlOffset', () => {
  it('grows with horizontal distance', () => {
    expect(bezierControlOffset(0, 1000)).toBeGreaterThan(bezierControlOffset(0, 100));
  });

  it('has a minimum floor for very close or backwards-pointing nodes', () => {
    expect(bezierControlOffset(100, 100)).toBeGreaterThanOrEqual(40);
    expect(bezierControlOffset(100, 50)).toBeGreaterThanOrEqual(40);
  });
});

describe('cubicBezierPoint', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 0 };
  const p2 = { x: 90, y: 100 };
  const p3 = { x: 100, y: 100 };

  it('t=0 is exactly the start point, t=1 is exactly the end point', () => {
    expect(cubicBezierPoint(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicBezierPoint(p0, p1, p2, p3, 1)).toEqual(p3);
  });

  it('t=0.5 lies strictly between the endpoints on a curving path', () => {
    const mid = cubicBezierPoint(p0, p1, p2, p3, 0.5);
    expect(mid.x).toBeGreaterThan(p0.x);
    expect(mid.x).toBeLessThan(p3.x);
    expect(mid.y).toBeGreaterThan(p0.y);
    expect(mid.y).toBeLessThan(p3.y);
  });

  it('a degenerate (straight-line) curve interpolates linearly', () => {
    const straight = cubicBezierPoint({ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(straight).toEqual({ x: 50, y: 0 });
  });
});

describe('resolveEdgeEndpoints', () => {
  const a = computeNodeLayout({ id: 'a', x: 0, y: 0 }, [], [{ id: 'main', label: 'Out' }]);
  const b = computeNodeLayout({ id: 'b', x: 300, y: 0 }, [{ id: 'main', label: 'In' }], []);

  it('resolves an edge to its two ports\' actual screen positions', () => {
    const [resolved] = resolveEdgeEndpoints([a, b], [{ from: 'a', to: 'b' }]);
    expect(resolved).toEqual({ from: a.outputs[0], to: b.inputs[0] });
  });

  it('is undefined, index-aligned, for an edge whose node is not currently laid out', () => {
    const resolved = resolveEdgeEndpoints([a], [{ from: 'a', to: 'ghost' }, { from: 'a', to: 'a' }]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toBeUndefined();
  });

  it('honors named ports over the default "main" when resolving', () => {
    const branch = computeNodeLayout(
      { id: 'branch', x: 0, y: 0 },
      [],
      [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }],
    );
    const [resolved] = resolveEdgeEndpoints([branch, b], [{ from: 'branch', to: 'b', fromPort: 'false' }]);
    expect(resolved?.from).toEqual(branch.outputs.find((p) => p.id === 'false'));
  });
});
