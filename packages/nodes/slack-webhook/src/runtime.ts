import { defineNode, type WorkflowItem } from '@fluxforge/sdk';
import { slackWebhookParamsSchema } from './schema.js';
import { buildRequest } from './request.js';

export const slackWebhookNode = defineNode({
  type: 'integration.slack-webhook',
  displayName: 'Slack Webhook',
  description: 'Posts a message to a Slack Incoming Webhook URL, once per input item (or once if there is no input).',
  category: 'integration',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: slackWebhookParamsSchema,
  async run(ctx) {
    const items: WorkflowItem[] = ctx.input.main !== undefined && ctx.input.main.length > 0 ? ctx.input.main : [{}];

    const results: WorkflowItem[] = [];
    for (const _item of items) {
      const { url, init } = buildRequest(ctx.params);
      const response = await fetch(url, init);
      const bodyText = await response.text();

      if (!response.ok) {
        throw new Error(`Slack webhook request failed with HTTP ${response.status}: ${bodyText}`);
      }

      results.push({ status: response.status, ok: response.ok, body: bodyText });
    }

    return { main: results };
  },
});
