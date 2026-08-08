import { defineNode, type WorkflowItem } from '@fluxforge/sdk';
import { discordWebhookParamsSchema } from './schema.js';
import { buildRequest, parseResponse } from './request.js';

export const discordWebhookNode = defineNode({
  type: 'integration.discord-webhook',
  displayName: 'Discord Webhook',
  description: 'Posts a message to a Discord webhook URL, once per input item (or once if there is no input).',
  category: 'integration',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: discordWebhookParamsSchema,
  async run(ctx) {
    const items: WorkflowItem[] = ctx.input.main !== undefined && ctx.input.main.length > 0 ? ctx.input.main : [{}];

    const results: WorkflowItem[] = [];
    for (const _item of items) {
      const { url, init } = buildRequest(ctx.params);
      const response = await fetch(url, init);
      const parsed = await parseResponse(response);

      if (!parsed.ok) {
        throw new Error(`Discord webhook request failed with HTTP ${parsed.status}`);
      }

      results.push({ status: parsed.status, ok: parsed.ok, body: parsed.body });
    }

    return { main: results };
  },
});
