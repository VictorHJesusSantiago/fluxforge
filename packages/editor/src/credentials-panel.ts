import type { ApiClient } from './api-client.js';

/**
 * A modal over the raw `/api/credentials` REST surface (`ApiClient`'s `listCredentials`/
 * `setCredential`/`deleteCredential`, backed by `@fluxforge/server`'s AES-256-GCM-at-rest store)
 * — credentials themselves were already fully functional (Milestone 5); this is the UI that
 * makes them reachable without a raw `curl`. Deliberately shows names only, never values: the
 * server's own `GET /api/credentials` endpoint returns names only by design (see its test,
 * "without ever returning its value over the list endpoint"), so there is no value to leak here
 * even if this panel tried to.
 */
export class CredentialsPanel {
  private readonly overlay: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly dataInput: HTMLTextAreaElement;
  private readonly errorEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly api: ApiClient,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'ff-modal-overlay';
    this.overlay.hidden = true;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const modal = document.createElement('div');
    modal.className = 'ff-modal';
    modal.innerHTML = `
      <div class="ff-modal__header">
        <h3>Credentials</h3>
        <button type="button" class="ff-modal__close">✕</button>
      </div>
      <p class="ff-modal__hint">Stored encrypted at rest. Values are never shown again after saving — only the name.</p>
      <ul class="ff-cred-list"></ul>
      <form class="ff-cred-form">
        <input type="text" class="ff-cred-name" placeholder="name (e.g. slack)" required />
        <textarea class="ff-cred-data" rows="2" placeholder='{"token": "..."}' required></textarea>
        <span class="ff-field__error ff-cred-error"></span>
        <button type="submit">Save credential</button>
      </form>
    `;
    this.overlay.appendChild(modal);
    this.root.appendChild(this.overlay);

    modal.querySelector('.ff-modal__close')!.addEventListener('click', () => this.close());
    this.listEl = modal.querySelector('.ff-cred-list')!;
    this.nameInput = modal.querySelector('.ff-cred-name')!;
    this.dataInput = modal.querySelector('.ff-cred-data')!;
    this.errorEl = modal.querySelector('.ff-cred-error')!;

    modal.querySelector('.ff-cred-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
  }

  async open(): Promise<void> {
    this.overlay.hidden = false;
    await this.refresh();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  private async refresh(): Promise<void> {
    const names = await this.api.listCredentials();
    this.listEl.replaceChildren();
    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ff-cred-empty';
      empty.textContent = 'No credentials stored yet.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const name of names) {
      const item = document.createElement('li');
      item.className = 'ff-cred-item';
      const label = document.createElement('span');
      label.textContent = name;
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => void this.remove(name));
      item.append(label, deleteButton);
      this.listEl.appendChild(item);
    }
  }

  private async submit(): Promise<void> {
    this.errorEl.textContent = '';
    const name = this.nameInput.value.trim();
    if (name === '') {
      this.errorEl.textContent = 'Name is required.';
      return;
    }
    let data: Record<string, string>;
    try {
      data = JSON.parse(this.dataInput.value) as Record<string, string>;
    } catch {
      this.errorEl.textContent = 'Data must be valid JSON, e.g. {"token": "..."}.';
      return;
    }
    await this.api.setCredential(name, data);
    this.nameInput.value = '';
    this.dataInput.value = '';
    await this.refresh();
  }

  private async remove(name: string): Promise<void> {
    await this.api.deleteCredential(name);
    await this.refresh();
  }
}
