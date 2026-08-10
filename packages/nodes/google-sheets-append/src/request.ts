import type { GoogleSheetsAppendParams } from './schema.js';

/**
 * The pure half of this node: building the Sheets API v4 `values.append` request, kept apart
 * from `runtime.ts` so it's unit-testable with no mocked `fetch` at all.
 *
 * Auth note: this node assumes it's handed an already-valid OAuth2 access token (via
 * `ctx.getCredential('google')?.token`), the same way `http-request`'s `credential` param
 * resolves a bearer token — obtaining/refreshing that token via a real Google OAuth consent flow
 * is out of scope for this node; it is purely "given a token, call the REST endpoint."
 */

export function buildAppendUrl(spreadsheetId: string, range: string): string {
  const encodedRange = encodeURIComponent(range);
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`;
}

export interface AppendPayload {
  values: Array<Array<string | number | boolean>>;
}

export function buildAppendPayload(params: GoogleSheetsAppendParams): AppendPayload {
  return { values: [params.values] };
}

export interface BuiltRequest {
  url: string;
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  };
}

export function buildRequest(params: GoogleSheetsAppendParams, token: string): BuiltRequest {
  return {
    url: buildAppendUrl(params.spreadsheetId, params.range),
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAppendPayload(params)),
    },
  };
}
