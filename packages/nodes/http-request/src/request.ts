import type { HttpRequestParams } from './schema.js';

/**
 * The pure half of this node: everything that can be computed without actually opening a
 * connection, kept apart from `runtime.ts` so it's unit-testable with no mocked `fetch` at all.
 */

export function buildUrl(url: string, query: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export interface BuiltRequest {
  url: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
}

export function buildRequest(params: HttpRequestParams, bearerToken?: string): BuiltRequest {
  const headers: Record<string, string> = { ...params.headers };
  if (bearerToken !== undefined) headers['Authorization'] = `Bearer ${bearerToken}`;

  const hasBody = params.method !== 'GET' && params.body !== undefined;
  let body: string | undefined;
  if (hasBody) {
    if (typeof params.body === 'string') {
      body = params.body;
    } else {
      body = JSON.stringify(params.body);
      if (headers['Content-Type'] === undefined) headers['Content-Type'] = 'application/json';
    }
  }

  return {
    url: buildUrl(params.url, params.query),
    init: { method: params.method, headers, ...(body === undefined ? {} : { body }) },
  };
}

export interface ParsedResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
}

/** `body`'s JSON-vs-text branch is genuinely runtime behaviour (depends on a real Response), but is kept here, separate from the fetch call itself, so `runtime.ts` only has to mock `fetch`, not `Response.json()`'s internals. */
export async function parseResponse(response: Response): Promise<ParsedResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  return { status: response.status, ok: response.ok, headers, body };
}
