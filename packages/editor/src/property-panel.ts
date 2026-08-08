import type { NodeInstance } from '@fluxforge/core';
import type { NodeTypeInfo } from './api-client.js';
import { describeFields, parseFieldInput, type FieldKind } from './json-schema-form.js';

export interface PropertyPanelOptions {
  container: HTMLElement;
  onParamsChange: (nodeId: string, params: Record<string, unknown>) => void;
  onToggleDisabled: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

/**
 * Renders a form for the selected node from its type's JSON Schema (`describeFields`) — the DOM
 * half of the same schema-driven-form idea NovaForge's editor used for its component inspector.
 * Rebuilt from scratch on every `show()` rather than diffed in place: a property panel changes
 * identity (which node, which schema) far more often than its field values change within one
 * node, so there is no steady-state re-render loop here to optimise for.
 */
export class PropertyPanel {
  constructor(private readonly options: PropertyPanelOptions) {}

  showEmpty(): void {
    this.options.container.innerHTML = '<p class="ff-panel__empty">Select a node to edit its properties.</p>';
  }

  show(node: NodeInstance, info: NodeTypeInfo | undefined): void {
    const container = this.options.container;
    container.replaceChildren();

    const header = document.createElement('div');
    header.className = 'ff-panel__header';
    header.innerHTML = `<h3>${escapeHtml(info?.displayName ?? node.type)}</h3><p>${escapeHtml(info?.description ?? '')}</p>`;
    container.appendChild(header);

    const toggle = document.createElement('label');
    toggle.className = 'ff-panel__toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = node.disabled === true;
    checkbox.addEventListener('change', () => this.options.onToggleDisabled(node.id));
    toggle.append(checkbox, document.createTextNode(' Disabled (passes input through unchanged)'));
    container.appendChild(toggle);

    const form = document.createElement('div');
    form.className = 'ff-panel__form';
    const fields = describeFields(info?.paramsSchema ?? { type: 'object' }, node.params);

    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'ff-field';

      const label = document.createElement('label');
      label.textContent = field.name + (field.required ? ' *' : '');
      row.appendChild(label);

      const input = buildInput(field.kind, field.currentValue, field.enumOptions);
      const errorEl = document.createElement('span');
      errorEl.className = 'ff-field__error';

      const commit = () => {
        const parsed = parseFieldInput(field.kind, input.value);
        if ('error' in parsed) {
          errorEl.textContent = parsed.error;
          return;
        }
        errorEl.textContent = '';
        this.options.onParamsChange(node.id, { ...node.params, [field.name]: parsed.value });
      };

      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.addEventListener('change', () => {
          this.options.onParamsChange(node.id, { ...node.params, [field.name]: input.checked });
        });
      } else {
        input.addEventListener('change', commit);
      }

      row.append(input, errorEl);
      form.appendChild(row);
    }
    container.appendChild(form);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'ff-panel__delete';
    deleteButton.textContent = 'Delete node';
    deleteButton.addEventListener('click', () => this.options.onDelete(node.id));
    container.appendChild(deleteButton);
  }
}

function buildInput(
  kind: FieldKind,
  currentValue: unknown,
  enumOptions: string[] | undefined,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (kind === 'enum' && enumOptions !== undefined) {
    const select = document.createElement('select');
    for (const option of enumOptions) {
      const optionEl = document.createElement('option');
      optionEl.value = option;
      optionEl.textContent = option;
      if (option === currentValue) optionEl.selected = true;
      select.appendChild(optionEl);
    }
    return select;
  }
  if (kind === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = currentValue === true;
    return input;
  }
  if (kind === 'json') {
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.value = currentValue === undefined ? '' : JSON.stringify(currentValue, null, 2);
    return textarea;
  }
  const input = document.createElement('input');
  input.type = kind === 'number' ? 'number' : 'text';
  input.value = currentValue === undefined ? '' : String(currentValue);
  return input;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
