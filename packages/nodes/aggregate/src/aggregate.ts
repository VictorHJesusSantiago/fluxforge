import type { WorkflowItem } from '@fluxforge/sdk';
import type { AggregateParams } from './schema.js';

/**
 * How non-numeric values of the aggregated `field` are handled: they are **skipped** for
 * `sum`/`avg`/`min`/`max` (a `string`/`boolean`/`null`/missing value simply doesn't contribute),
 * but `count` always counts every item in the group regardless of whether its `field` value is
 * numeric — "count" answers "how many items are here," not "how many had a usable number." This
 * mirrors how a spreadsheet's SUM/AVERAGE ignore non-numeric cells rather than erroring, which is
 * the least surprising behaviour for a node an editor user wires up without reading source.
 *
 * When a group (or the whole input, without `groupBy`) has zero numeric values, `sum` is 0 and
 * `avg`/`min`/`max` are also 0 rather than `NaN`/`undefined` — `NaN` doesn't round-trip through
 * `JSON.stringify` (it becomes `null`), and `undefined` would silently drop the key. `0` keeps
 * the output shape stable and JSON-safe at the cost of being indistinguishable from "the numbers
 * present genuinely summed/averaged to zero" — an acceptable trade for a workflow node over a
 * reporting tool.
 */
function summarize(values: number[], operations: AggregateParams['operations'], itemCount: number): WorkflowItem {
  const result: WorkflowItem = {};
  for (const op of operations) {
    switch (op) {
      case 'count':
        result.count = itemCount;
        break;
      case 'sum':
        result.sum = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        result.avg = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        result.min = values.length === 0 ? 0 : Math.min(...values);
        break;
      case 'max':
        result.max = values.length === 0 ? 0 : Math.max(...values);
        break;
    }
  }
  return result;
}

function numericValuesOf(items: WorkflowItem[], field: string): number[] {
  const values: number[] = [];
  for (const item of items) {
    const raw = item[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      values.push(raw);
    }
  }
  return values;
}

/**
 * Collapses `items` into one summary item (no `groupBy`) or one summary item per distinct
 * `groupBy` value — pure and separately tested, same pattern as `logic.if`'s `evaluateCondition`.
 * An empty `items` array with no `groupBy` still produces exactly one item (all requested
 * operations computed over zero values); with `groupBy` it produces zero items, since there are
 * no distinct group values to summarize.
 */
export function aggregateItems(items: WorkflowItem[], params: AggregateParams): WorkflowItem[] {
  if (params.groupBy === undefined) {
    return [summarize(numericValuesOf(items, params.field), params.operations, items.length)];
  }

  const groupKey = params.groupBy;
  const order: unknown[] = [];
  const groups = new Map<unknown, WorkflowItem[]>();
  for (const item of items) {
    const value = item[groupKey];
    if (!groups.has(value)) {
      groups.set(value, []);
      order.push(value);
    }
    groups.get(value)!.push(item);
  }

  return order.map((value) => {
    const groupItems = groups.get(value)!;
    return {
      [groupKey]: value,
      ...summarize(numericValuesOf(groupItems, params.field), params.operations, groupItems.length),
    };
  });
}
