/**
 * Parses Server-Sent-Events text off a plain `fetch()` response body — the browser's native
 * `EventSource` can't be used here because `EventSource` only ever issues `GET` requests, and
 * starting a workflow run is a `POST` (see `@fluxforge/server`'s `http.ts`). This is the pure
 * half of that: given whatever bytes have arrived so far, split out the complete `data: ...`
 * events and hand back the leftover partial line so the next chunk can continue it — a chunk
 * boundary from the network has no reason to land on an event boundary.
 */

export interface SseParseResult<T> {
  events: T[];
  remainder: string;
}

export function parseSseChunk<T>(buffer: string, newChunk: string): SseParseResult<T> {
  const combined = buffer + newChunk;
  const parts = combined.split('\n\n');
  const remainder = parts.pop() ?? '';

  const events: T[] = [];
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice('data: '.length);
      try {
        events.push(JSON.parse(json) as T);
      } catch {
      }
    }
  }

  return { events, remainder };
}
