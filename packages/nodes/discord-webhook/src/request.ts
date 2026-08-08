import type { DiscordWebhookParams } from './schema.js';

/**
 * The pure half of this node: building the Discord webhook POST payload and parsing its
 * response, kept apart from `runtime.ts` so it's unit-testable with no mocked `fetch` at all.
 */

export interface DiscordMessagePayload {
  content: string;
  username?: string;
}

export function buildDiscordPayload(params: DiscordWebhookParams): DiscordMessagePayload {
  const payload: DiscordMessagePayload = { content: params.content };
  if (params.username !== undefined) payload.username = params.username;
  return payload;
}

export interface BuiltRequest {
  url: string;
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  };
}

export function buildRequest(params: DiscordWebhookParams): BuiltRequest {
  return {
    url: params.webhookUrl,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDiscordPayload(params)),
    },
  };
}

export interface ParsedResponse {
  status: number;
  ok: boolean;
  /** Discord returns `204 No Content` (empty body) on success by default; only non-empty
   *  JSON bodies (e.g. when `?wait=true` is used, or on error) are parsed. */
  body: unknown;
}

/**
 * Discord webhooks respond `204 No Content` with an empty body on success — calling
 * `response.json()` on that would throw. We branch on content-type/length the same way
 * `http-request`'s `parseResponse` branches on content-type, but additionally treat "no body at
 * all" as `null` rather than attempting to parse it.
 */
export async function parseResponse(response: Response): Promise<ParsedResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  let body: unknown = null;
  if (text.length > 0 && contentType.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else if (text.length > 0) {
    body = text;
  }

  return { status: response.status, ok: response.ok, body };
}
