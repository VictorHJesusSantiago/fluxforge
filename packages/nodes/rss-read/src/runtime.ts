import { defineNode } from '@fluxforge/sdk';
import { rssReadParamsSchema } from './schema.js';
import { parseFeed } from './parse-feed.js';

export const rssReadNode = defineNode({
  type: 'integration.rss-read',
  displayName: 'RSS Read',
  description: 'Fetches an RSS or Atom feed URL and returns one item per entry with title, link, and publish date.',
  category: 'integration',
  inputs: [],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: rssReadParamsSchema,
  async run(ctx) {
    const response = await fetch(ctx.params.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch feed (HTTP ${response.status}) from ${ctx.params.url}`);
    }

    const xml = await response.text();
    const entries = parseFeed(xml);

    return {
      main: entries.map((entry) => ({
        title: entry.title,
        link: entry.link,
        publishedAt: entry.publishedAt,
      })),
    };
  },
});
