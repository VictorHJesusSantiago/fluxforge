import { defineNode } from '@fluxforge/sdk';
import { manualParamsSchema } from './schema.js';

/**
 * The simplest possible trigger. No inputs (it is a root node — the executor seeds `ctx.input.main`
 * with whatever `initialInput` the run was started with) and a single passthrough `main` output.
 * This is the default trigger every example/new workflow starts with.
 */
export const manualNode = defineNode({
  type: 'trigger.manual',
  displayName: 'Manual Trigger',
  description: 'Starts a workflow run when a person clicks "run" in the editor, passing through the seeded input unchanged.',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: manualParamsSchema,
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});
