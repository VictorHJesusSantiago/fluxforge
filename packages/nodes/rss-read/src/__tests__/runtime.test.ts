import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { rssReadNode } from '../runtime.js';

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Blog</title>
    <item>
      <title>Hello World</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/rss+xml' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('integration.rss-read node', () => {
  it('fetches the feed URL and returns parsed entries', async () => {
    const fetchSpy = vi.fn(async () => textResponse(RSS_FIXTURE));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await runNode(rssReadNode, { url: 'https://example.com/feed.xml' }, {});

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/feed.xml');
    expect(output.main).toEqual([
      {
        title: 'Hello World',
        link: 'https://example.com/1',
        publishedAt: new Date('Mon, 01 Jan 2024 12:00:00 GMT').toISOString(),
      },
    ]);
  });

  it('returns an empty list for a feed with no entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => textResponse('<rss><channel></channel></rss>')));

    const output = await runNode(rssReadNode, { url: 'https://example.com/empty.xml' }, {});
    expect(output.main).toEqual([]);
  });

  it('throws on a non-2xx response so the executor can retry it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => textResponse('not found', 404)));

    await expect(runNode(rssReadNode, { url: 'https://example.com/missing.xml' }, {})).rejects.toThrow(/HTTP 404/);
  });
});
