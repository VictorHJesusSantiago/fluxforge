import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { discordWebhookNode } from '../runtime.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('integration.discord-webhook node', () => {
  it('makes exactly one request when there is no input, and handles a 204 No Content success', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await runNode(
      discordWebhookNode,
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc', content: 'hi' },
      {},
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(output.main).toEqual([{ status: 204, ok: true, body: null }]);
  });

  it('makes one request per input item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    const output = await runNode(
      discordWebhookNode,
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc', content: 'hi' },
      { main: [{}, {}, {}] },
    );

    expect(output.main).toHaveLength(3);
  });

  it('sends the expected URL, headers and JSON body', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    await runNode(
      discordWebhookNode,
      {
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        content: 'build failed',
        username: 'ci-bot',
      },
      {},
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'build failed', username: 'ci-bot' });
  });

  it('throws on a non-2xx response so the executor can retry it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'rate limited' }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(
      runNode(discordWebhookNode, { webhookUrl: 'https://discord.com/api/webhooks/123/abc', content: 'hi' }, {}),
    ).rejects.toThrow(/HTTP 429/);
  });
});
