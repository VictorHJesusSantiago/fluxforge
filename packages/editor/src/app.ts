import type { RunEvent, WorkflowDefinition } from '@fluxforge/core';
import type { ApiClient, NodeTypeInfo } from './api-client.js';
import { render, layoutsFor, type CanvasState, type NodeStatus } from './canvas.js';
import { hitTestEdge, hitTestNodeBody, hitTestPort } from './hit-test.js';
import { addEdge, addNode, emptyWorkflow, moveNode, removeEdge, removeNode, updateNodeParams, setNodeDisabled } from './graph-edit.js';
import type { PropertyPanel } from './property-panel.js';
import type { NodePalette } from './node-palette.js';

/**
 * The interactive controller: owns the editor's mutable state, wires DOM/canvas events to the
 * pure `graph-edit.ts` functions, and re-renders after every change. Deliberately a plain class
 * with imperative event handlers rather than a reactive framework — the state is small (one
 * workflow document, a handful of UI flags) and changes only in response to discrete user
 * gestures, which is exactly the case NovaForge's own editor makes for skipping a framework too.
 */
export class EditorApp {
  private workflow: WorkflowDefinition;
  private nodeTypes = new Map<string, NodeTypeInfo>();
  private selectedNodeId: string | undefined;
  private selectedEdgeIndex: number | undefined;
  private nodeStatus = new Map<string, NodeStatus>();
  private dragging: { nodeId: string; offsetX: number; offsetY: number } | undefined;
  private connecting: { fromNodeId: string; fromPort: string; fromX: number; fromY: number } | undefined;
  private panning: { startClientX: number; startClientY: number; startPanX: number; startPanY: number } | undefined;
  private pointer = { x: 0, y: 0 };
  private readonly pan = { x: 260, y: 40 };
  private zoom = 1;
  private workflowId: string | undefined;
  private running = false;

  private static readonly MIN_ZOOM = 0.25;
  private static readonly MAX_ZOOM = 2.5;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly api: ApiClient,
    private readonly propertyPanel: PropertyPanel,
    private readonly palette: NodePalette,
    private readonly statusEl: HTMLElement,
  ) {
    this.workflow = emptyWorkflow(crypto.randomUUID(), 'Untitled workflow');
    this.bindCanvasEvents();
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  async init(workflowId?: string): Promise<void> {
    const nodeTypes = await this.api.listNodeTypes();
    this.nodeTypes = new Map(nodeTypes.map((n) => [n.type, n]));
    this.palette.render(nodeTypes);

    if (workflowId !== undefined) {
      this.workflow = await this.api.getWorkflow(workflowId);
      this.workflowId = workflowId;
    }
    this.propertyPanel.showEmpty();
    this.rerender();
  }

  rerender(): void {
    const state: CanvasState = {
      workflow: this.workflow,
      nodeTypes: this.nodeTypes,
      selectedNodeId: this.selectedNodeId,
      selectedEdgeIndex: this.selectedEdgeIndex,
      nodeStatus: this.nodeStatus,
      connecting:
        this.connecting === undefined
          ? undefined
          : { x: this.pointer.x, y: this.pointer.y, fromX: this.connecting.fromX, fromY: this.connecting.fromY },
      pan: this.pan,
      zoom: this.zoom,
    };
    render(this.ctx, this.canvasEl, state);
  }

  /** Inverts the same `translate(pan)` → `scale(zoom)` transform `canvas.ts`'s `render` applies, so a click always lands on the world-space point actually under the cursor at any pan/zoom. */
  private toWorldPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.pan.x) / this.zoom,
      y: (clientY - rect.top - this.pan.y) / this.zoom,
    };
  }

  private bindCanvasEvents(): void {
    this.canvasEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvasEl.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvasEl.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  /**
   * Zooms toward the cursor, not the canvas origin — the world point currently under the mouse
   * must stay under the mouse after the zoom changes, which is `pan' = clientPoint - worldPoint *
   * newZoom` (solved from `clientPoint = pan + worldPoint * zoom` at both the old and new zoom).
   */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvasEl.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldX = (clientX - this.pan.x) / this.zoom;
    const worldY = (clientY - this.pan.y) / this.zoom;

    const factor = Math.exp(-e.deltaY * 0.001);
    const newZoom = Math.min(EditorApp.MAX_ZOOM, Math.max(EditorApp.MIN_ZOOM, this.zoom * factor));

    this.pan.x = clientX - worldX * newZoom;
    this.pan.y = clientY - worldY * newZoom;
    this.zoom = newZoom;
    this.rerender();
  }

  private onMouseDown(e: MouseEvent): void {
    const point = this.toWorldPoint(e.clientX, e.clientY);
    const layouts = layoutsFor({ workflow: this.workflow, nodeTypes: this.nodeTypes });

    const port = hitTestPort(layouts, point);
    if (port !== undefined && port.kind === 'output') {
      this.connecting = { fromNodeId: port.nodeId, fromPort: port.portId, fromX: port.x, fromY: port.y };
      return;
    }

    const nodeId = hitTestNodeBody(layouts, point);
    if (nodeId !== undefined) {
      const layout = layouts.find((l) => l.id === nodeId)!;
      this.selectedNodeId = nodeId;
      this.selectedEdgeIndex = undefined;
      this.dragging = { nodeId, offsetX: point.x - layout.x, offsetY: point.y - layout.y };
      this.showPropertiesFor(nodeId);
      this.rerender();
      return;
    }

    // A fixed *screen*-pixel tolerance, converted to world units by dividing by zoom — otherwise
    // an edge gets harder to click when zoomed out and comically easy when zoomed in, since the
    // hit test runs in the same world space the click point was already converted into.
    const edgeIndex = hitTestEdge(layouts, this.workflow.edges, point, 6 / this.zoom);
    if (edgeIndex !== undefined) {
      this.selectedNodeId = undefined;
      this.selectedEdgeIndex = edgeIndex;
      this.propertyPanel.showEmpty();
      this.rerender();
      return;
    }

    // Clicked empty canvas: deselect and start a pan drag, exactly like every other node-graph
    // editor's "drag the background to pan" gesture — no modifier key required, since nothing
    // else claims a plain click-and-drag on empty space.
    this.selectedNodeId = undefined;
    this.selectedEdgeIndex = undefined;
    this.propertyPanel.showEmpty();
    this.panning = { startClientX: e.clientX, startClientY: e.clientY, startPanX: this.pan.x, startPanY: this.pan.y };
    this.rerender();
  }

  private onMouseMove(e: MouseEvent): void {
    this.pointer = this.toWorldPoint(e.clientX, e.clientY);

    if (this.panning !== undefined) {
      this.pan.x = this.panning.startPanX + (e.clientX - this.panning.startClientX);
      this.pan.y = this.panning.startPanY + (e.clientY - this.panning.startClientY);
      this.pointer = this.toWorldPoint(e.clientX, e.clientY); // pan just moved the world under the cursor
      this.rerender();
      return;
    }

    if (this.dragging !== undefined) {
      this.workflow = moveNode(
        this.workflow,
        this.dragging.nodeId,
        this.pointer.x - this.dragging.offsetX,
        this.pointer.y - this.dragging.offsetY,
      );
      this.rerender();
      return;
    }

    if (this.connecting !== undefined) {
      this.rerender();
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.connecting !== undefined) {
      const point = this.toWorldPoint(e.clientX, e.clientY);
      const layouts = layoutsFor({ workflow: this.workflow, nodeTypes: this.nodeTypes });
      const target = hitTestPort(layouts, point);
      if (target !== undefined && target.kind === 'input' && target.nodeId !== this.connecting.fromNodeId) {
        this.workflow = addEdge(this.workflow, {
          from: this.connecting.fromNodeId,
          to: target.nodeId,
          fromPort: this.connecting.fromPort,
          toPort: target.portId,
        });
      }
      this.connecting = undefined;
      this.rerender();
    }
    this.dragging = undefined;
    this.panning = undefined;
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return; // typing in the property panel must not also delete the node being edited
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;

    if (this.selectedNodeId !== undefined) {
      this.deleteNode(this.selectedNodeId);
    } else if (this.selectedEdgeIndex !== undefined) {
      this.workflow = removeEdge(this.workflow, this.selectedEdgeIndex);
      this.selectedEdgeIndex = undefined;
      this.rerender();
    }
  }

  private showPropertiesFor(nodeId: string): void {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);
    if (node === undefined) return;
    this.propertyPanel.show(node, this.nodeTypes.get(node.type));
  }

  addNodeOfType(type: string): void {
    const info = this.nodeTypes.get(type);
    if (info === undefined) return;
    const id = crypto.randomUUID();
    // Cascades new nodes diagonally so repeatedly clicking the palette doesn't stack them
    // exactly on top of each other, which would make the newest one impossible to grab.
    const cascade = (this.workflow.nodes.length % 8) * 24;
    this.workflow = addNode(this.workflow, { id, type, params: {}, metadata: { x: 40 + cascade, y: 40 + cascade } });
    this.selectedNodeId = id;
    this.showPropertiesFor(id);
    this.rerender();
  }

  deleteNode(nodeId: string): void {
    this.workflow = removeNode(this.workflow, nodeId);
    this.selectedNodeId = undefined;
    this.propertyPanel.showEmpty();
    this.rerender();
  }

  onParamsChange(nodeId: string, params: Record<string, unknown>): void {
    this.workflow = updateNodeParams(this.workflow, nodeId, params);
    this.rerender();
  }

  onToggleDisabled(nodeId: string): void {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);
    this.workflow = setNodeDisabled(this.workflow, nodeId, !(node?.disabled === true));
    this.showPropertiesFor(nodeId);
    this.rerender();
  }

  async save(): Promise<void> {
    if (this.workflowId === undefined) {
      this.workflowId = await this.api.createWorkflow(this.workflow.name, this.workflow);
      const url = new URL(window.location.href);
      url.searchParams.set('workflow', this.workflowId);
      window.history.replaceState(null, '', url.toString());
    } else {
      await this.api.saveWorkflow(this.workflowId, this.workflow.name, this.workflow);
    }
    this.setStatus('Saved.');
  }

  async run(): Promise<void> {
    if (this.workflowId === undefined) await this.save();
    if (this.workflowId === undefined || this.running) return;

    this.running = true;
    this.nodeStatus.clear();
    this.setStatus('Running…');
    try {
      await this.api.runWorkflow(this.workflowId, [{}], (event) => this.onRunEvent(event));
      this.setStatus('Run finished.');
    } catch (error) {
      this.setStatus(`Run failed to start: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private onRunEvent(event: RunEvent): void {
    switch (event.kind) {
      case 'node.started':
        this.nodeStatus.set(event.nodeId, 'running');
        break;
      case 'node.succeeded':
        this.nodeStatus.set(event.nodeId, 'succeeded');
        break;
      case 'node.failed':
        this.nodeStatus.set(event.nodeId, 'failed');
        break;
      case 'node.skipped':
        this.nodeStatus.set(event.nodeId, 'skipped');
        break;
      default:
        break;
    }
    this.rerender();
  }

  newWorkflow(): void {
    this.workflow = emptyWorkflow(crypto.randomUUID(), 'Untitled workflow');
    this.workflowId = undefined;
    this.selectedNodeId = undefined;
    this.nodeStatus.clear();
    this.propertyPanel.showEmpty();
    const url = new URL(window.location.href);
    url.searchParams.delete('workflow');
    window.history.replaceState(null, '', url.toString());
    this.rerender();
  }

  setName(name: string): void {
    this.workflow = { ...this.workflow, name };
  }

  currentName(): string {
    return this.workflow.name;
  }

  private setStatus(message: string): void {
    this.statusEl.textContent = message;
  }
}
