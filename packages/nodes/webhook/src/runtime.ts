import { defineNode } from '@fluxforge/sdk';
import { webhookParamsSchema } from './schema.js';

/**
 * Represents "this workflow starts when an HTTP request hits a URL." Like `trigger.manual`, the
 * node itself does no HTTP work — the server owns receiving the request, matching it to this
 * node's `path`/`method`, and seeding `ctx.input.main` with the parsed body/query before the run
 * starts. This node's own `run` is a passthrough, same as `trigger.manual`; what distinguishes it
 * is only the declared `path`/`method` params the server reads to decide routing.
 */
export const webhookNode = defineNode({
  type: 'trigger.webhook',
  displayName: 'Webhook Trigger',
  description: 'Starts a workflow run when an HTTP request hits the configured path and method.',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: webhookParamsSchema,
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});
