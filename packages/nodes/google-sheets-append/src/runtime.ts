import { defineNode, type WorkflowItem } from '@fluxforge/sdk';
import { googleSheetsAppendParamsSchema } from './schema.js';
import { buildRequest } from './request.js';

export const googleSheetsAppendNode = defineNode({
  type: 'integration.google-sheets-append',
  displayName: 'Google Sheets Append',
  description: 'Appends a row to a Google Sheet via the Sheets API v4, once per input item (or once if there is no input).',
  category: 'integration',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: googleSheetsAppendParamsSchema,
  credentials: ['google'],
  async run(ctx) {
    const token = ctx.getCredential('google')?.token;
    if (token === undefined) {
      throw new Error('integration.google-sheets-append requires a "google" credential with a valid OAuth2 "token" field');
    }

    const items: WorkflowItem[] = ctx.input.main !== undefined && ctx.input.main.length > 0 ? ctx.input.main : [{}];

    const results: WorkflowItem[] = [];
    for (const _item of items) {
      const { url, init } = buildRequest(ctx.params, token);
      const response = await fetch(url, init);
      const bodyText = await response.text();
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      if (!response.ok) {
        throw new Error(`Google Sheets append failed with HTTP ${response.status}: ${bodyText}`);
      }

      results.push({ status: response.status, ok: response.ok, body });
    }

    return { main: results };
  },
});
