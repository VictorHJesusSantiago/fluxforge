import {
  PORT_HIT_RADIUS,
  bezierControlOffset,
  cubicBezierPoint,
  resolveEdgeEndpoints,
  type NodeLayout,
} from './layout.js';

/** Screen pixels, not world units — callers pass a tolerance already divided by the current zoom, the same way `PORT_HIT_RADIUS` is a fixed world-space value nodes and ports use unscaled. */
const EDGE_HIT_TOLERANCE = 6;
const EDGE_SAMPLE_STEPS = 24;

export interface PortHit {
  nodeId: string;
  portId: string;
  kind: 'input' | 'output';
  x: number;
  y: number;
}

/**
 * Checks ports before node bodies, and later layouts before earlier ones — both deliberate.
 * Ports sit right at a node's edge, close enough to its body's bounding box that a body-hit-test
 * would otherwise win first and make the port impossible to grab precisely; and when nodes
 * overlap, the one drawn last (highest z-order, later in the array) is the one visually on top,
 * so it should be the one a click lands on.
 */
export function hitTestPort(layouts: NodeLayout[], point: { x: number; y: number }): PortHit | undefined {
  for (let i = layouts.length - 1; i >= 0; i -= 1) {
    const layout = layouts[i]!;
    for (const port of layout.outputs) {
      if (distance(port, point) <= PORT_HIT_RADIUS) {
        return { nodeId: layout.id, portId: port.id, kind: 'output', x: port.x, y: port.y };
      }
    }
    for (const port of layout.inputs) {
      if (distance(port, point) <= PORT_HIT_RADIUS) {
        return { nodeId: layout.id, portId: port.id, kind: 'input', x: port.x, y: port.y };
      }
    }
  }
  return undefined;
}

export function hitTestNodeBody(layouts: NodeLayout[], point: { x: number; y: number }): string | undefined {
  for (let i = layouts.length - 1; i >= 0; i -= 1) {
    const layout = layouts[i]!;
    if (
      point.x >= layout.x &&
      point.x <= layout.x + layout.width &&
      point.y >= layout.y &&
      point.y <= layout.y + layout.height
    ) {
      return layout.id;
    }
  }
  return undefined;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Finds the edge whose drawn bezier curve passes closest to `point`, within `tolerance` — by
 * sampling the exact same cubic curve `canvas.ts`'s `drawEdge` paints (same control-point
 * formula, `bezierControlOffset`), not a straight-line approximation, so a click near a curve's
 * bend registers even though it's nowhere near the straight line between its two endpoints.
 * Later edges (drawn on top) win ties, matching `hitTestNodeBody`'s same "topmost wins" rule.
 */
export function hitTestEdge(
  layouts: NodeLayout[],
  edges: Array<{ from: string; to: string; fromPort?: string; toPort?: string }>,
  point: { x: number; y: number },
  tolerance = EDGE_HIT_TOLERANCE,
): number | undefined {
  const endpoints = resolveEdgeEndpoints(layouts, edges);
  for (let i = endpoints.length - 1; i >= 0; i -= 1) {
    const pair = endpoints[i];
    if (pair === undefined) continue;
    const { from, to } = pair;
    const offset = bezierControlOffset(from.x, to.x);
    const cp1 = { x: from.x + offset, y: from.y };
    const cp2 = { x: to.x - offset, y: to.y };

    let minDistance = Infinity;
    for (let step = 0; step <= EDGE_SAMPLE_STEPS; step += 1) {
      const t = step / EDGE_SAMPLE_STEPS;
      const sample = cubicBezierPoint(from, cp1, cp2, to, t);
      minDistance = Math.min(minDistance, distance(sample, point));
    }
    if (minDistance <= tolerance) return i;
  }
  return undefined;
}
