/**
 * A small, dependency-free RSS 2.0 / Atom feed parser. RSS/Atom's relevant subset — `<item>` /
 * `<entry>` blocks each containing a title, a link, and a publish date — is regular enough
 * (no attribute-heavy nesting, no namespaces we care about) to extract with straightforward
 * string/regex scanning rather than pulling in a full XML parsing dependency.
 *
 * Deliberately NOT a general XML parser: it only knows how to find `<item>`/`<entry>` blocks and
 * pull a handful of named child tags out of each one.
 */

export interface FeedEntry {
  title?: string | undefined;
  link?: string | undefined;
  publishedAt?: string | undefined;
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

function stripCdata(raw: string): string {
  const match = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? (match[1] ?? '') : raw;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Extracts a simple text child tag's content, e.g. `<title>Foo</title>` -> `"Foo"`. */
function extractText(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  if (match === null) return undefined;
  const text = decodeEntities(stripCdata(match[1] ?? '')).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Atom's `<link>` is self-closing with an `href` attribute, e.g.
 * `<link rel="alternate" href="https://example.com/post" />`, unlike RSS's plain-text `<link>`.
 * A feed may list several `<link>` tags (alternate, self, ...); we prefer `rel="alternate"` (or
 * no `rel` at all, the implicit default) and fall back to the first `href` found otherwise.
 */
function extractAtomLink(block: string): string | undefined {
  const linkTags = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback: string | undefined;

  for (const tag of linkTags) {
    const hrefMatch = tag.match(/href\s*=\s*"([^"]*)"/i) ?? tag.match(/href\s*=\s*'([^']*)'/i);
    if (hrefMatch === null) continue;

    const relMatch = tag.match(/rel\s*=\s*"([^"]*)"/i) ?? tag.match(/rel\s*=\s*'([^']*)'/i);
    const rel = relMatch?.[1];
    if (rel === undefined || rel === 'alternate') return hrefMatch[1];
    if (fallback === undefined) fallback = hrefMatch[1];
  }

  return fallback;
}

function normalizeDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseRssItem(block: string): FeedEntry {
  return {
    title: extractText(block, 'title'),
    link: extractText(block, 'link'),
    publishedAt: normalizeDate(extractText(block, 'pubDate')),
  };
}

function parseAtomEntry(block: string): FeedEntry {
  return {
    title: extractText(block, 'title'),
    link: extractAtomLink(block),
    publishedAt: normalizeDate(extractText(block, 'published') ?? extractText(block, 'updated')),
  };
}

/**
 * Parses either an RSS 2.0 (`<item>`) or Atom (`<entry>`) feed document into a flat list of
 * entries. Detects the format by which block tag is present — an Atom document with `<entry>`
 * elements is preferred over RSS if (implausibly) both appear. Returns `[]` for an empty,
 * malformed, or entry-less document rather than throwing — a feed with zero parseable entries is
 * a legitimate (if boring) result, not an error.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const entryBlocks = extractBlocks(xml, 'entry');
  if (entryBlocks.length > 0) {
    return entryBlocks.map(parseAtomEntry);
  }

  const itemBlocks = extractBlocks(xml, 'item');
  return itemBlocks.map(parseRssItem);
}
