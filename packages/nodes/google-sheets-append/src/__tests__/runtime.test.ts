import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode, createTestContext } from '@fluxforge/sdk';
import { googleSheetsAppendNode } from '../runtime.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseParams = { spreadsheetId: '1a2b3c', range: 'Sheet1!A:Z', values: ['x', 1] };

describe('integration.google-sheets-append node', () => {
  it('throws a clear error when no google credential is configured', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(runNode(googleSheetsAppendNode, baseParams, {})).rejects.toThrow(/google.*credential/i);
  });

  it('appends exactly one row when there is no input', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ updates: { updatedRows: 1 } }));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await googleSheetsAppendNode.run(
      createTestContext({
        params: baseParams,
        input: {},
        getCredential: (name) => (name === 'google' ? { token: 'ya29.abc' } : undefined),
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(output.main).toEqual([{ status: 200, ok: true, body: { updates: { updatedRows: 1 } } }]);
  });

  it('appends one row per input item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));

    const output = await googleSheetsAppendNode.run(
      createTestContext({
        params: baseParams,
        input: { main: [{}, {}, {}] },
        getCredential: (name) => (name === 'google' ? { token: 'ya29.abc' } : undefined),
      }),
    );

    expect(output.main).toHaveLength(3);
  });

  it('builds the URL from spreadsheetId/range and sends the Authorization header', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchSpy);

    await googleSheetsAppendNode.run(
      createTestContext({
        params: { spreadsheetId: 'sheet-xyz', range: 'Data!A:C', values: ['a', 'b', 'c'] },
        input: {},
        getCredential: (name) => (name === 'google' ? { token: 'ya29.xyz' } : undefined),
      }),
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-xyz/values/Data!A%3AC:append?valueInputOption=USER_ENTERED',
    );
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ya29.xyz');
    expect(JSON.parse(init.body as string)).toEqual({ values: [['a', 'b', 'c']] });
  });

  it('throws on a non-2xx response so the executor can retry it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'bad range' } }, 400)));

    await expect(
      googleSheetsAppendNode.run(
        createTestContext({
          params: baseParams,
          input: {},
          getCredential: (name) => (name === 'google' ? { token: 'ya29.abc' } : undefined),
        }),
      ),
    ).rejects.toThrow(/HTTP 400/);
  });
});
