import { describe, it, expect } from 'vitest';
import { buildSlackPayload, buildRequest } from '../request.js';
import type { SlackWebhookParams } from '../schema.js';

function params(overrides: Partial<SlackWebhookParams> = {}): SlackWebhookParams {
  return {
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
    text: 'hello world',
    ...overrides,
  };
}

describe('buildSlackPayload', () => {
  it('builds a payload with just text when channel/username are omitted', () => {
    expect(buildSlackPayload(params())).toEqual({ text: 'hello world' });
  });

  it('includes channel and username when given', () => {
    expect(buildSlackPayload(params({ channel: '#general', username: 'bot' }))).toEqual({
      text: 'hello world',
      channel: '#general',
      username: 'bot',
    });
  });
});

describe('buildRequest', () => {
  it('POSTs JSON to the webhook URL', () => {
    const { url, init } = buildRequest(params());
    expect(url).toBe('https://hooks.slack.com/services/T00/B00/XXX');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ text: 'hello world' }));
  });

  it('serialises channel and username into the body', () => {
    const { init } = buildRequest(params({ channel: '#alerts', username: 'flux' }));
    expect(JSON.parse(init.body)).toEqual({ text: 'hello world', channel: '#alerts', username: 'flux' });
  });
});
