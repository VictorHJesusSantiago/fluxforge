import { defineNode } from '@fluxforge/sdk';
import { noOpParamsSchema } from './schema.js';

export const noOpNode = defineNode({
  type: 'utility.no-op',
  displayName: 'No Op',
  description: 'Passes the main input through unchanged — a placeholder node for a workflow still being built.',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: noOpParamsSchema,
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});
