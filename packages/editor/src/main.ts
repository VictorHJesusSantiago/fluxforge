import { ApiClient } from './api-client.js';
import { EditorApp } from './app.js';
import { PropertyPanel } from './property-panel.js';
import { NodePalette } from './node-palette.js';
import { CredentialsPanel } from './credentials-panel.js';
import { DeadLetterPanel } from './dead-letter-panel.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('2d canvas context unavailable');

function resizeCanvas(): void {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', () => {
  resizeCanvas();
  app.rerender();
});
resizeCanvas();

const propertyPanel = new PropertyPanel({
  container: document.getElementById('property-panel')!,
  onParamsChange: (nodeId, params) => app.onParamsChange(nodeId, params),
  onToggleDisabled: (nodeId) => app.onToggleDisabled(nodeId),
  onDelete: (nodeId) => app.deleteNode(nodeId),
});

const palette = new NodePalette(document.getElementById('palette')!, (type) => app.addNodeOfType(type));

const api = new ApiClient();
const statusEl = document.getElementById('status')!;
const app = new EditorApp(canvas, ctx, api, propertyPanel, palette, statusEl);

document.getElementById('btn-new')?.addEventListener('click', () => app.newWorkflow());
document.getElementById('btn-save')?.addEventListener('click', () => void app.save());
document.getElementById('btn-run')?.addEventListener('click', () => void app.run());

const credentialsPanel = new CredentialsPanel(document.body, api);
document.getElementById('btn-credentials')?.addEventListener('click', () => void credentialsPanel.open());

const deadLetterPanel = new DeadLetterPanel(document.body, api);
document.getElementById('btn-dead-letter')?.addEventListener('click', () => void deadLetterPanel.open());

const nameInput = document.getElementById('workflow-name') as HTMLInputElement | null;
nameInput?.addEventListener('change', () => app.setName(nameInput.value));

const params = new URLSearchParams(window.location.search);
const workflowId = params.get('workflow') ?? undefined;

app
  .init(workflowId)
  .then(() => {
    if (nameInput !== null) nameInput.value = app.currentName();
  })
  .catch((error: unknown) => {
    statusEl.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
  });
