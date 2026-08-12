import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { slackWebhookNode } from '../runtime.js';

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('integration.slack-webhook node', () => {
  it('makes exactly one request when there is no input', async () => {
    const fetchSpy = vi.fn(async () => textResponse('ok'));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await runNode(
      slackWebhookNode,
      { webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX', text: 'hi' },
      {},
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(output.main).toEqual([{ status: 200, ok: true, body: 'ok' }]);
  });

  it('makes one request per input item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => textResponse('ok')));

    const output = await runNode(
      slackWebhookNode,
      { webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX', text: 'hi' },
      { main: [{}, {}] },
    );

    expect(output.main).toHaveLength(2);
  });

  it('sends the expected URL, headers and JSON body', async () => {
    const fetchSpy = vi.fn(async () => textResponse('ok'));
    vi.stubGlobal('fetch', fetchSpy);

    await runNode(
      slackWebhookNode,
      {
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
        text: 'deploy finished',
        channel: '#deploys',
        username: 'flux-bot',
      },
      {},
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/services/T00/B00/XXX');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'deploy finished',
      channel: '#deploys',
      username: 'flux-bot',
    });
  });

  it('throws on a non-2xx response so the executor can retry it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => textResponse('invalid_payload', 400)));

    await expect(
      runNode(slackWebhookNode, { webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX', text: 'hi' }, {}),
    ).rejects.toThrow(/HTTP 400/);
  });
});
