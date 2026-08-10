import type { WorkflowItem } from '@fluxforge/sdk';
import { defineNode } from '@fluxforge/sdk';
import { ifParamsSchema, type IfParams } from './schema.js';

/**
 * Pure and exported on its own — the actual decision logic, kept apart from `defineNode`'s glue
 * so it's testable with plain objects and so the editor can (eventually) preview "which branch
 * would this item take" without spinning up the executor.
 */
export function evaluateCondition(item: WorkflowItem, params: IfParams): boolean {
  const actual = item[params.field];

  switch (params.operator) {
    case 'isEmpty':
      return actual === undefined || actual === null || actual === '';
    case 'isNotEmpty':
      return !(actual === undefined || actual === null || actual === '');
    case 'equals':
      return actual === params.value;
    case 'notEquals':
      return actual !== params.value;
    case 'contains':
      return typeof actual === 'string' && typeof params.value === 'string' && actual.includes(params.value);
    case 'greaterThan':
      return typeof actual === 'number' && typeof params.value === 'number' && actual > params.value;
    case 'lessThan':
      return typeof actual === 'number' && typeof params.value === 'number' && actual < params.value;
  }
}

/**
 * Routes each item to `true` or `false` individually — a batch of 10 items can split 6-and-4
 * across the two output ports in the same run, rather than the whole batch taking one branch
 * based on, say, only the first item. Whichever port ends up with zero items causes the
 * executor's generic empty-input skip rule (see `@fluxforge/core`'s `WorkflowExecutor` doc) to
 * skip everything wired to that port — this node has no idea that happens, which is the point.
 */
export const ifNode = defineNode({
  type: 'logic.if',
  displayName: 'If',
  description: 'Splits items into "true" and "false" branches by testing one field per item.',
  category: 'logic',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [
    { id: 'true', label: 'True' },
    { id: 'false', label: 'False' },
  ],
  paramsSchema: ifParamsSchema,
  async run(ctx) {
    const trueItems: WorkflowItem[] = [];
    const falseItems: WorkflowItem[] = [];
    for (const item of ctx.input.main ?? []) {
      (evaluateCondition(item, ctx.params) ? trueItems : falseItems).push(item);
    }
    return { true: trueItems, false: falseItems };
  },
});
