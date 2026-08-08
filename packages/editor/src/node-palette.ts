import type { NodeTypeInfo } from './api-client.js';

/** The sidebar list of every registered node type, grouped by category — click one to add it. */
export class NodePalette {
  constructor(
    private readonly container: HTMLElement,
    private readonly onAdd: (type: string) => void,
  ) {}

  render(nodeTypes: NodeTypeInfo[]): void {
    this.container.replaceChildren();
    const byCategory = new Map<string, NodeTypeInfo[]>();
    for (const info of nodeTypes) {
      const list = byCategory.get(info.category) ?? [];
      list.push(info);
      byCategory.set(info.category, list);
    }

    for (const [category, infos] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const section = document.createElement('div');
      section.className = 'ff-palette__section';
      const heading = document.createElement('h4');
      heading.textContent = category;
      section.appendChild(heading);

      for (const info of infos.sort((a, b) => a.displayName.localeCompare(b.displayName))) {
        const button = document.createElement('button');
        button.className = 'ff-palette__item';
        button.textContent = info.displayName;
        button.title = info.description;
        button.addEventListener('click', () => this.onAdd(info.type));
        section.appendChild(button);
      }
      this.container.appendChild(section);
    }
  }
}
