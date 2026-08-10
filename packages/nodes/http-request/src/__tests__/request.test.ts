import { describe, it, expect } from 'vitest';
import { buildUrl, buildRequest } from '../request.js';
import type { HttpRequestParams } from '../schema.js';

function params(overrides: Partial<HttpRequestParams> = {}): HttpRequestParams {
  return {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: {},
    query: {},
    timeoutMs: 10_000,
    ignoreHttpErrors: false,
    ...overrides,
  };
}

describe('buildUrl', () => {
  it('appends query params to a bare URL', () => {
    expect(buildUrl('https://api.example.com/x', { a: '1', b: '2' })).toBe(
      'https://api.example.com/x?a=1&b=2',
    );
  });

  it('merges with existing query params on the URL, overriding on conflict', () => {
    expect(buildUrl('https://api.example.com/x?a=old', { a: 'new' })).toBe(
      'https://api.example.com/x?a=new',
    );
  });

  it('leaves the URL unchanged when there are no query params', () => {
    expect(buildUrl('https://api.example.com/x', {})).toBe('https://api.example.com/x');
  });
});

describe('buildRequest', () => {
  it('builds a GET request with no body even if body params are set', () => {
    const { init } = buildRequest(params({ method: 'GET', body: { should: 'be ignored' } }));
    expect(init.body).toBeUndefined();
  });

  it('JSON-encodes an object body and sets Content-Type for a POST', () => {
    const { init } = buildRequest(params({ method: 'POST', body: { a: 1 } }));
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('does not override an explicit Content-Type header', () => {
    const { init } = buildRequest(
      params({ method: 'POST', body: { a: 1 }, headers: { 'Content-Type': 'application/vnd.custom+json' } }),
    );
    expect(init.headers['Content-Type']).toBe('application/vnd.custom+json');
  });

  it('sends a string body as-is, unencoded', () => {
    const { init } = buildRequest(params({ method: 'POST', body: 'raw text' }));
    expect(init.body).toBe('raw text');
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('injects a bearer token as the Authorization header when given', () => {
    const { init } = buildRequest(params(), 'secret-token');
    expect(init.headers['Authorization']).toBe('Bearer secret-token');
  });

  it('omits Authorization entirely when no token is given', () => {
    const { init } = buildRequest(params());
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('resolves the final URL including query params', () => {
    const { url } = buildRequest(params({ query: { page: '2' } }));
    expect(url).toBe('https://api.example.com/items?page=2');
  });
});
