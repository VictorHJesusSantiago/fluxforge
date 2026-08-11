import { defineNode } from '@fluxforge/sdk';
import { respondToWebhookParamsSchema } from './schema.js';

/**
 * A terminal marker node for a workflow triggered by `trigger.webhook`: it declares "here is the
 * HTTP response this run should produce," but doesn't send anything itself — nothing in
 * `@fluxforge/core`'s executor knows about HTTP. `@fluxforge/server` is the one actually holding
 * the open HTTP response; once a run finishes, it reads this node's `RunState.nodes[nodeId]
 * .output.response` (a single item: `{ statusCode, body }`) and writes that out. The `response`
 * output port is declared but deliberately left unwired in every real workflow graph — it exists
 * so the value survives in `NodeRunState.output` (which the executor only populates for a
 * `succeeded` node's declared outputs), not to feed a downstream node.
 */
export const respondToWebhookNode = defineNode({
  type: 'utility.respond-to-webhook',
  displayName: 'Respond to Webhook',
  description:
    'Marks the HTTP response (status code and body) a webhook-triggered run should send back; read by ' +
    '@fluxforge/server off this node\'s succeeded output, not consumed in-graph.',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'response', label: 'Response (read by the server, not wired in-graph)' }],
  paramsSchema: respondToWebhookParamsSchema,
  async run(ctx) {
    return { response: [{ statusCode: ctx.params.statusCode, body: ctx.params.body }] };
  },
});
