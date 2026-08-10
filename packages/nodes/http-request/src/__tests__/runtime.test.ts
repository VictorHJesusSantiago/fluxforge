import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { httpRequestNode } from '../runtime.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('action.http-request node', () => {
  it('makes exactly one request when there is no input', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await runNode(httpRequestNode, { url: 'https://api.example.com/x' }, {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(output.main).toEqual([{ status: 200, ok: true, headers: { 'content-type': 'application/json' }, body: { ok: true } }]);
  });

  it('makes one request per input item', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchSpy);

    await runNode(httpRequestNode, { url: 'https://api.example.com/x' }, { main: [{}, {}, {}] });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws on a non-2xx response by default, so the executor can retry it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 500)));

    await expect(runNode(httpRequestNode, { url: 'https://api.example.com/x' }, {})).rejects.toThrow(/HTTP 500/);
  });

  it('ignoreHttpErrors routes the error status into the output instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 404)));

    const output = await runNode(
      httpRequestNode,
      { url: 'https://api.example.com/x', ignoreHttpErrors: true },
      {},
    );
    expect(output.main).toEqual([{ status: 404, ok: false, headers: { 'content-type': 'application/json' }, body: { error: 'nope' } }]);
  });

  it('sends a bearer token resolved from the named credential', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchSpy);

    await httpRequestNode.run({
      runId: 'r',
      nodeId: 'n',
      params: {
        url: 'https://api.example.com/x',
        method: 'GET',
        headers: {},
        query: {},
        timeoutMs: 10_000,
        ignoreHttpErrors: false,
        credential: 'my-api',
      },
      input: {},
      signal: new AbortController().signal,
      logger: { info() {}, warn() {}, error() {} },
      getCredential: (name) => (name === 'my-api' ? { token: 'abc123' } : undefined),
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer abc123');
  });

  it('aborts and rejects when the request exceeds timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        });
      }),
    );

    await expect(
      runNode(httpRequestNode, { url: 'https://api.example.com/x', timeoutMs: 5 }, {}),
    ).rejects.toThrow();
  });
});
