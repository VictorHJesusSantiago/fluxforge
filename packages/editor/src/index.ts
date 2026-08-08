/**
 * @fluxforge/editor — the canvas-based visual workflow editor. Everything below is exported for
 * reuse/testing; `main.ts` (the actual page bootstrap) is intentionally not — it has side
 * effects (reads `document`, touches `window.location`) the moment it's imported.
 */
export { ApiClient, type NodeTypeInfo, type WorkflowSummary, type DeadLetterJob } from './api-client.js';
export { EditorApp } from './app.js';
export { PropertyPanel } from './property-panel.js';
export { NodePalette } from './node-palette.js';
export { CredentialsPanel } from './credentials-panel.js';
export { DeadLetterPanel } from './dead-letter-panel.js';
export { render, layoutsFor, type CanvasState, type NodeStatus } from './canvas.js';
export {
  computeNodeLayout,
  bezierControlOffset,
  cubicBezierPoint,
  resolveEdgeEndpoints,
  type NodeLayout,
  type PortLayout,
  type EdgeEndpoints,
} from './layout.js';
export { hitTestNodeBody, hitTestPort, hitTestEdge, type PortHit } from './hit-test.js';
export {
  addNode,
  removeNode,
  moveNode,
  updateNodeParams,
  setNodeDisabled,
  addEdge,
  removeEdge,
  emptyWorkflow,
} from './graph-edit.js';
export { parseSseChunk, type SseParseResult } from './sse-parser.js';
export {
  describeFields,
  parseFieldInput,
  type FieldDescriptor,
  type FieldKind,
  type JsonSchemaObject,
  type JsonSchemaProperty,
} from './json-schema-form.js';
