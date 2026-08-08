import type { WorkflowItem } from '@fluxforge/sdk';
import { defineNode } from '@fluxforge/sdk';
import { filterParamsSchema, type FilterParams } from './schema.js';

/**
 * Pure and exported on its own, mirroring `logic.if`'s `evaluateCondition` — same small condition
 * language, kept apart from `defineNode`'s glue so it's directly testable with plain objects.
 */
export function evaluateCondition(item: WorkflowItem, params: FilterParams): boolean {
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
 * Unlike `logic.if`, which routes both matching and non-matching items to separate ports, `filter`
 * has exactly one output port and simply drops non-matching items. An all-non-matching input
 * legitimately produces zero output items — that's not a bug, it's what causes the executor's
 * generic empty-input skip rule to skip whatever is wired downstream (see `@fluxforge/core`'s
 * `WorkflowExecutor` doc comment).
 */
export const filterNode = defineNode({
  type: 'logic.filter',
  displayName: 'Filter',
  description: 'Keeps only the items matching a condition on one field, dropping the rest.',
  category: 'logic',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: filterParamsSchema,
  async run(ctx) {
    const kept: WorkflowItem[] = (ctx.input.main ?? []).filter((item) => evaluateCondition(item, ctx.params));
    return { main: kept };
  },
});
