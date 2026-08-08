import { defineNode } from '@fluxforge/sdk';
import { aggregateParamsSchema } from './schema.js';
import { aggregateItems } from './aggregate.js';

export const aggregateNode = defineNode({
  type: 'data.aggregate',
  displayName: 'Aggregate',
  description:
    'Collapses all input items into one summary item (or one per distinct groupBy value) computing sum/count/avg/min/max over a numeric field.',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: aggregateParamsSchema,
  async run(ctx) {
    return { main: aggregateItems(ctx.input.main ?? [], ctx.params) };
  },
});
