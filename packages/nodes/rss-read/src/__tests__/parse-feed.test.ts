import { describe, it, expect } from 'vitest';
import { parseFeed } from '../parse-feed.js';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Blog</title>
    <link>https://example.com</link>
    <description>An example RSS feed</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/posts/1</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <description>The first post</description>
    </item>
    <item>
      <title><![CDATA[Second Post &amp; More]]></title>
      <link>https://example.com/posts/2</link>
      <pubDate>Tue, 02 Jan 2024 09:30:00 GMT</pubDate>
    </item>
    <item>
      <title>Third Post (no date)</title>
      <link>https://example.com/posts/3</link>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <link href="https://example.com/" rel="self" />
  <updated>2024-01-02T09:30:00Z</updated>
  <entry>
    <title>Atom Entry One</title>
    <link rel="alternate" href="https://example.com/atom/1" />
    <link rel="self" href="https://example.com/feed/atom/1" />
    <published>2024-01-01T12:00:00Z</published>
    <updated>2024-01-01T13:00:00Z</updated>
    <id>urn:uuid:1</id>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom/2" />
    <updated>2024-01-02T09:30:00Z</updated>
    <id>urn:uuid:2</id>
  </entry>
</feed>`;

describe('parseFeed — RSS 2.0', () => {
  it('extracts title, link and publishedAt for every item', () => {
    const entries = parseFeed(RSS_FIXTURE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      title: 'First Post',
      link: 'https://example.com/posts/1',
      publishedAt: new Date('Mon, 01 Jan 2024 12:00:00 GMT').toISOString(),
    });
  });

  it('decodes CDATA-wrapped and entity-encoded titles', () => {
    const entries = parseFeed(RSS_FIXTURE);
    expect(entries[1].title).toBe('Second Post & More');
  });

  it('leaves publishedAt undefined when pubDate is missing', () => {
    const entries = parseFeed(RSS_FIXTURE);
    expect(entries[2]).toEqual({
      title: 'Third Post (no date)',
      link: 'https://example.com/posts/3',
      publishedAt: undefined,
    });
  });
});

describe('parseFeed — Atom', () => {
  it('extracts title, alternate link and published date for every entry', () => {
    const entries = parseFeed(ATOM_FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: 'Atom Entry One',
      link: 'https://example.com/atom/1',
      publishedAt: '2024-01-01T12:00:00.000Z',
    });
  });

  it('falls back to <updated> when <published> is absent', () => {
    const entries = parseFeed(ATOM_FIXTURE);
    expect(entries[1]).toEqual({
      title: 'Atom Entry Two',
      link: 'https://example.com/atom/2',
      publishedAt: '2024-01-02T09:30:00.000Z',
    });
  });

  it('prefers the alternate-rel link over a self-rel link', () => {
    const entries = parseFeed(ATOM_FIXTURE);
    expect(entries[0].link).toBe('https://example.com/atom/1');
  });
});

describe('parseFeed — edge cases', () => {
  it('returns an empty array for an empty string', () => {
    expect(parseFeed('')).toEqual([]);
  });

  it('returns an empty array for a feed with a channel but no items', () => {
    const xml = '<rss version="2.0"><channel><title>Empty</title></channel></rss>';
    expect(parseFeed(xml)).toEqual([]);
  });

  it('returns an empty array for malformed, non-XML input', () => {
    expect(parseFeed('this is not xml at all')).toEqual([]);
  });

  it('ignores an item with no recognisable child tags', () => {
    const xml = '<rss><channel><item><foo>bar</foo></item></channel></rss>';
    expect(parseFeed(xml)).toEqual([{ title: undefined, link: undefined, publishedAt: undefined }]);
  });

  it('prefers Atom entries over RSS items if a document somehow has both', () => {
    const xml = `<feed><entry><title>Atom Wins</title></entry></feed><rss><item><title>RSS Loses</title></item></rss>`;
    const entries = parseFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Atom Wins');
  });
});
