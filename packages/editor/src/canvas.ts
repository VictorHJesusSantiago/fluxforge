import type { WorkflowDefinition } from '@fluxforge/core';
import type { NodeTypeInfo } from './api-client.js';
import { computeNodeLayout, bezierControlOffset, resolveEdgeEndpoints, type NodeLayout } from './layout.js';

/**
 * All the actual pixel-pushing, in one place — deliberately thin and deliberately untested
 * (matching this project's own precedent: `@novaforge`'s `Canvas2DRenderer` was never unit
 * tested either), because everything that decides *where* things end up (`layout.ts`,
 * `hit-test.ts`) already is. This file just paints whatever those already-tested functions say.
 */

export type NodeStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'skipped';

const STATUS_COLOR: Record<NodeStatus, string> = {
  idle: '#2a2a3a',
  running: '#4cc9f0',
  succeeded: '#3ddc84',
  failed: '#ef476f',
  skipped: '#555566',
};

export interface CanvasState {
  workflow: WorkflowDefinition;
  nodeTypes: Map<string, NodeTypeInfo>;
  selectedNodeId: string | undefined;
  selectedEdgeIndex: number | undefined;
  nodeStatus: Map<string, NodeStatus>;
  connecting: { x: number; y: number; fromX: number; fromY: number } | undefined;
  pan: { x: number; y: number };
  zoom: number;
}

export function layoutsFor(state: Pick<CanvasState, 'workflow' | 'nodeTypes'>): NodeLayout[] {
  return state.workflow.nodes.map((node) => {
    const info = state.nodeTypes.get(node.type);
    const meta = (node.metadata ?? {}) as { x?: number; y?: number };
    return computeNodeLayout(
      { id: node.id, x: meta.x ?? 0, y: meta.y ?? 0 },
      info?.inputs ?? [],
      info?.outputs ?? [],
    );
  });
}

export function render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: CanvasState): void {
  const { width, height } = canvas;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(state.pan.x, state.pan.y);
  ctx.scale(state.zoom, state.zoom);
  drawGrid(ctx, width, height, state.pan, state.zoom);

  const layouts = layoutsFor(state);
  const layoutById = new Map(layouts.map((l) => [l.id, l]));

  const endpoints = resolveEdgeEndpoints(layouts, state.workflow.edges);
  endpoints.forEach((points, index) => {
    if (points === undefined) return;
    drawEdge(ctx, points.from, points.to, index === state.selectedEdgeIndex);
  });

  if (state.connecting !== undefined) {
    drawEdge(
      ctx,
      { x: state.connecting.fromX, y: state.connecting.fromY },
      { x: state.connecting.x, y: state.connecting.y },
      false,
    );
  }

  for (const node of state.workflow.nodes) {
    const layout = layoutById.get(node.id);
    const info = state.nodeTypes.get(node.type);
    if (layout === undefined) continue;
    drawNode(ctx, layout, info, node.id === state.selectedNodeId, state.nodeStatus.get(node.id) ?? 'idle', node.disabled === true);
  }

  ctx.restore();
}

/**
 * Drawn in world space (after `ctx.translate(pan)` + `ctx.scale(zoom)` are already active), so
 * the visible screen rectangle in world coordinates is `[-pan / zoom, (screenSize - pan) / zoom]`
 * — dividing the pan-adjusted screen bounds by zoom, not just subtracting pan, is what keeps the
 * grid covering the whole canvas at every zoom level instead of only the un-zoomed portion of it.
 */
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, pan: { x: number; y: number }, zoom: number): void {
  const spacing = 24;
  ctx.strokeStyle = '#1a1d24';
  ctx.lineWidth = 1 / zoom; // stays a hairline on screen regardless of zoom, since ctx.scale would otherwise scale it too
  ctx.beginPath();
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (width - pan.x) / zoom;
  const bottom = (height - pan.y) / zoom;
  const startX = left - ((left % spacing) + spacing) % spacing;
  const startY = top - ((top % spacing) + spacing) % spacing;
  for (let x = startX; x < right; x += spacing) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y < bottom; y += spacing) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  selected: boolean,
): void {
  const offset = bezierControlOffset(from.x, to.x);
  ctx.strokeStyle = selected ? '#6ea8fe' : '#4a4a5a';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(from.x + offset, from.y, to.x - offset, to.y, to.x, to.y);
  ctx.stroke();
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  layout: NodeLayout,
  info: NodeTypeInfo | undefined,
  selected: boolean,
  status: NodeStatus,
  disabled: boolean,
): void {
  ctx.fillStyle = '#181a22';
  ctx.strokeStyle = selected ? '#6ea8fe' : STATUS_COLOR[status];
  ctx.lineWidth = selected ? 2.5 : status === 'idle' ? 1 : 2;
  roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = disabled ? '#55556a' : '#e6e6e6';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(info?.displayName ?? '?', layout.x + 10, layout.y + 14, layout.width - 20);

  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#8a8aa0';
  for (const port of layout.inputs) {
    ctx.beginPath();
    ctx.arc(port.x, port.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#333344';
    ctx.fill();
    ctx.strokeStyle = '#6a6a7a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (const port of layout.outputs) {
    ctx.beginPath();
    ctx.arc(port.x, port.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#333344';
    ctx.fill();
    ctx.strokeStyle = '#6a6a7a';
    ctx.stroke();
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
