import type { ApiClient } from './api-client.js';

/**
 * A modal listing `PersistentQueue.deadLetter()`'s contents (via `/api/dead-letter`) with a
 * requeue action per job — the queue's dead-lettering and `requeue()` were already fully
 * functional and tested (Milestone 2); this closes the last "exists but nothing surfaces it"
 * gap the roadmap called out.
 */
export class DeadLetterPanel {
  private readonly overlay: HTMLElement;
  private readonly listEl: HTMLElement;

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
        <h3>Dead-letter queue</h3>
        <button type="button" class="ff-modal__close">✕</button>
      </div>
      <p class="ff-modal__hint">Jobs that exhausted every retry attempt. Requeue to give one a fresh attempt cycle.</p>
      <ul class="ff-dlq-list"></ul>
    `;
    this.overlay.appendChild(modal);
    this.root.appendChild(this.overlay);

    modal.querySelector('.ff-modal__close')!.addEventListener('click', () => this.close());
    this.listEl = modal.querySelector('.ff-dlq-list')!;
  }

  async open(): Promise<void> {
    this.overlay.hidden = false;
    await this.refresh();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  private async refresh(): Promise<void> {
    const jobs = await this.api.listDeadLetter();
    this.listEl.replaceChildren();
    if (jobs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ff-dlq-empty';
      empty.textContent = 'Nothing dead-lettered.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const job of jobs) {
      const item = document.createElement('li');
      item.className = 'ff-dlq-item';

      const summary = document.createElement('div');
      summary.className = 'ff-dlq-item__summary';
      summary.innerHTML = `<strong>${escapeHtml(job.type)}</strong> <span class="ff-dlq-item__meta">${job.attempts}/${job.maxAttempts} attempts</span>`;

      const error = document.createElement('div');
      error.className = 'ff-dlq-item__error';
      error.textContent = job.lastError ?? '(no error recorded)';

      const requeueButton = document.createElement('button');
      requeueButton.type = 'button';
      requeueButton.textContent = 'Requeue';
      requeueButton.addEventListener('click', () => void this.requeue(job.id));

      item.append(summary, error, requeueButton);
      this.listEl.appendChild(item);
    }
  }

  private async requeue(jobId: string): Promise<void> {
    await this.api.requeueDeadLetter(jobId);
    await this.refresh();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
