import type { NodePort } from '@fluxforge/sdk';

/**
 * Pure geometry — no canvas, no DOM. Kept apart from `canvas.ts` (the actual drawing) the same
 * way `hit-test.ts` is, so where a port dot actually ends up on screen is a fully unit-testable
 * fact, not something only provable by looking at a rendered frame.
 */

export const NODE_WIDTH = 180;
export const NODE_HEADER_HEIGHT = 28;
export const PORT_ROW_HEIGHT = 20;
export const PORT_TOP_MARGIN = 12;
export const PORT_HIT_RADIUS = 8;

export interface PortLayout {
  id: string;
  x: number;
  y: number;
}

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs: PortLayout[];
  outputs: PortLayout[];
}

/**
 * @param node the node's top-left position (its own stored `metadata.x`/`metadata.y`)
 * @param inputs the node type's declared input ports
 * @param outputs the node type's declared output ports
 */
export function computeNodeLayout(
  node: { id: string; x: number; y: number },
  inputs: NodePort[],
  outputs: NodePort[],
): NodeLayout {
  const rows = Math.max(inputs.length, outputs.length, 1);
  const height = NODE_HEADER_HEIGHT + PORT_TOP_MARGIN * 2 + (rows - 1) * PORT_ROW_HEIGHT;

  const portY = (index: number) => node.y + NODE_HEADER_HEIGHT + PORT_TOP_MARGIN + index * PORT_ROW_HEIGHT;

  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: NODE_WIDTH,
    height,
    inputs: inputs.map((p, i) => ({ id: p.id, x: node.x, y: portY(i) })),
    outputs: outputs.map((p, i) => ({ id: p.id, x: node.x + NODE_WIDTH, y: portY(i) })),
  };
}

/**
 * A control-point offset proportional to the horizontal distance, clamped so a very short or
 * backwards-pointing edge doesn't produce a control point wildly overshooting the node it
 * connects to — the same shape every node-graph editor's "S-curve" connector uses.
 */
export function bezierControlOffset(x1: number, x2: number): number {
  return Math.max(Math.abs(x2 - x1) * 0.5, 40);
}

/** A point on the cubic bezier `canvas.ts`'s `drawEdge` actually paints — shared with `hit-test.ts` so a click is tested against the exact curve drawn, not an approximation of it. */
export function cubicBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export interface EdgeEndpoints {
  from: PortLayout;
  to: PortLayout;
}

/**
 * Resolves each edge's actual on-screen port positions from the current node layouts — one
 * shared implementation for `canvas.ts` (drawing) and `hit-test.ts` (clicking), so which edges
 * are "missing an endpoint and simply not drawn" can never quietly disagree between the two.
 * The array is index-aligned with `edges`; a dangling edge (endpoint node not currently laid
 * out — mid-delete, or a corrupt save) is `undefined` at that index rather than throwing.
 */
export function resolveEdgeEndpoints(
  layouts: NodeLayout[],
  edges: Array<{ from: string; to: string; fromPort?: string; toPort?: string }>,
): Array<EdgeEndpoints | undefined> {
  const layoutById = new Map(layouts.map((l) => [l.id, l]));
  return edges.map((edge) => {
    const from = layoutById.get(edge.from);
    const to = layoutById.get(edge.to);
    if (from === undefined || to === undefined) return undefined;
    const fromPort = from.outputs.find((p) => p.id === (edge.fromPort ?? 'main')) ?? from.outputs[0];
    const toPort = to.inputs.find((p) => p.id === (edge.toPort ?? 'main')) ?? to.inputs[0];
    if (fromPort === undefined || toPort === undefined) return undefined;
    return { from: fromPort, to: toPort };
  });
}
