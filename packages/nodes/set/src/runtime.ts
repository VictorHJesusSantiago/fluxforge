import type { WorkflowItem } from '@fluxforge/sdk';
import { defineNode } from '@fluxforge/sdk';
import { setParamsSchema, type SetParams } from './schema.js';

/**
 * Pure and exported on its own, same pattern as `logic.if`'s `evaluateCondition`. `remove` is
 * applied before `set` — so a field named in both `remove` and `set` ends up present (the `set`
 * value wins), never removed. This lets a workflow author write "replace `status`" as
 * `{ remove: ['status'], set: { status: 'done' } }` without worrying about ordering surprises;
 * the alternative order (set-then-remove) would make that combination pointless since the newly
 * set value would just be deleted again.
 */
export function applySet(item: WorkflowItem, params: SetParams): WorkflowItem {
  const next: WorkflowItem = { ...item };
  for (const field of params.remove) {
    delete next[field];
  }
  return { ...next, ...params.set };
}

export const setNode = defineNode({
  type: 'data.set',
  displayName: 'Set',
  description: 'Assigns, renames (via remove+set), and removes fields on every item.',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: setParamsSchema,
  async run(ctx) {
    const items = (ctx.input.main ?? []).map((item) => applySet(item, ctx.params));
    return { main: items };
  },
});
