import type { RunEvent, RunEventListener } from './types.js';

/**
 * A minimal typed pub/sub for one run's events — not Node's `EventEmitter` (no wildcard events,
 * no memory-leak-warning heuristics to configure) because a run only ever has one event *kind*
 * (`RunEvent`, itself a discriminated union) and needs nothing else. `@fluxforge/server` bridges
 * this to Server-Sent Events per listening HTTP client.
 */
export class RunEventBus {
  private readonly listeners = new Set<RunEventListener>();

  subscribe(listener: RunEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RunEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
