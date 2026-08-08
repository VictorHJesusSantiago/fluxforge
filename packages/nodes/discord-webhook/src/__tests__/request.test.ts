import { describe, it, expect } from 'vitest';
import { buildDiscordPayload, buildRequest, parseResponse } from '../request.js';
import type { DiscordWebhookParams } from '../schema.js';

function params(overrides: Partial<DiscordWebhookParams> = {}): DiscordWebhookParams {
  return {
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    content: 'hello world',
    ...overrides,
  };
}

describe('buildDiscordPayload', () => {
  it('builds a payload with just content when username is omitted', () => {
    expect(buildDiscordPayload(params())).toEqual({ content: 'hello world' });
  });

  it('includes username when given', () => {
    expect(buildDiscordPayload(params({ username: 'bot' }))).toEqual({
      content: 'hello world',
      username: 'bot',
    });
  });
});

describe('buildRequest', () => {
  it('POSTs JSON to the webhook URL', () => {
    const { url, init } = buildRequest(params());
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ content: 'hello world' });
  });
});

describe('parseResponse', () => {
  it('treats a 204 No Content success response as a null body', async () => {
    const response = new Response(null, { status: 204 });
    const parsed = await parseResponse(response);
    expect(parsed).toEqual({ status: 204, ok: true, body: null });
  });

  it('parses a JSON error body on failure (e.g. rate limiting)', async () => {
    const response = new Response(JSON.stringify({ message: 'rate limited', retry_after: 1.2 }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    const parsed = await parseResponse(response);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(429);
    expect(parsed.body).toEqual({ message: 'rate limited', retry_after: 1.2 });
  });

  it('falls back to raw text for a non-JSON body', async () => {
    const response = new Response('not json', { status: 200 });
    const parsed = await parseResponse(response);
    expect(parsed.body).toBe('not json');
  });
});
