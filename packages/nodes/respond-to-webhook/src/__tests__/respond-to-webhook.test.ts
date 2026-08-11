import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { respondToWebhookNode } from '../runtime.js';

describe('utility.respond-to-webhook node', () => {
  it('returns statusCode and body on the response port', async () => {
    const output = await runNode(
      respondToWebhookNode,
      { statusCode: 201, body: { ok: true } },
      { main: [{ id: 1 }] },
    );
    expect(output.response).toEqual([{ statusCode: 201, body: { ok: true } }]);
  });

  it('defaults statusCode to 200 and body to undefined when omitted', async () => {
    const output = await runNode(respondToWebhookNode, {}, { main: [] });
    expect(output.response).toEqual([{ statusCode: 200, body: undefined }]);
  });

  it('does not produce anything on a main output port', async () => {
    const output = await runNode(respondToWebhookNode, { statusCode: 404 }, { main: [] });
    expect(output.main).toBeUndefined();
  });

  it('rejects an out-of-range statusCode at the schema level', async () => {
    await expect(runNode(respondToWebhookNode, { statusCode: 999 }, { main: [] })).rejects.toThrow();
  });
});
