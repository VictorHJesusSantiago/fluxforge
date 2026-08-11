import type { SlackWebhookParams } from './schema.js';

/**
 * The pure half of this node: building the Slack "Incoming Webhook" POST payload, kept apart
 * from `runtime.ts` so it's unit-testable with no mocked `fetch` at all. Mirrors the split in
 * `packages/nodes/http-request/src/request.ts`.
 */

export interface SlackMessagePayload {
  text: string;
  channel?: string;
  username?: string;
}

export function buildSlackPayload(params: SlackWebhookParams): SlackMessagePayload {
  const payload: SlackMessagePayload = { text: params.text };
  if (params.channel !== undefined) payload.channel = params.channel;
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

export function buildRequest(params: SlackWebhookParams): BuiltRequest {
  return {
    url: params.webhookUrl,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSlackPayload(params)),
    },
  };
}
