import { describe, it, expect } from 'vitest';
import { buildAppendUrl, buildAppendPayload, buildRequest } from '../request.js';
import type { GoogleSheetsAppendParams } from '../schema.js';

function params(overrides: Partial<GoogleSheetsAppendParams> = {}): GoogleSheetsAppendParams {
  return {
    spreadsheetId: '1a2b3c',
    range: 'Sheet1!A:Z',
    values: ['a', 1, true],
    ...overrides,
  };
}

describe('buildAppendUrl', () => {
  it('builds the values:append endpoint URL with valueInputOption', () => {
    expect(buildAppendUrl('1a2b3c', 'Sheet1!A:Z')).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/1a2b3c/values/Sheet1!A%3AZ:append?valueInputOption=USER_ENTERED',
    );
  });

  it('URL-encodes the spreadsheetId and range', () => {
    expect(buildAppendUrl('id with space', 'My Sheet!A1')).toContain('id%20with%20space');
  });
});

describe('buildAppendPayload', () => {
  it('wraps the row in an outer array as the Sheets API expects', () => {
    expect(buildAppendPayload(params())).toEqual({ values: [['a', 1, true]] });
  });
});

describe('buildRequest', () => {
  it('builds a POST request with the bearer token and correct URL/body', () => {
    const { url, init } = buildRequest(params(), 'ya29.token');
    expect(url).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/1a2b3c/values/Sheet1!A%3AZ:append?valueInputOption=USER_ENTERED',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer ya29.token');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ values: [['a', 1, true]] });
  });
});
