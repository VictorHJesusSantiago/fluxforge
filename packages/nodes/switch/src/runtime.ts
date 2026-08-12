import type { WorkflowItem, PortItems } from '@fluxforge/sdk';
import { defineNode } from '@fluxforge/sdk';
import { switchParamsSchema, CASE_PORT_IDS, DEFAULT_PORT_ID, type SwitchParams } from './schema.js';

/**
 * Pure and exported on its own, mirroring `logic.if`'s `evaluateCondition` — decides, for a single
 * item, which output port id it belongs on. The first case whose `value` strictly-equals
 * `item[field]` wins; no match routes to `DEFAULT_PORT_ID`. Kept apart from `defineNode`'s glue so
 * routing decisions are testable with plain objects.
 */
export function routeItem(item: WorkflowItem, params: SwitchParams): string {
  const actual = item[params.field];
  const match = params.cases.find((c) => c.value === actual);
  return match?.output ?? DEFAULT_PORT_ID;
}

/**
 * A generalization of `logic.if`: routes each item (individually, same as `if`) to the output
 * port matching its `field` value among the configured `cases`, falling back to `default` when
 * nothing matches. Output ports are a fixed set — `case-0`..`case-4` plus `default` — rather than
 * genuinely dynamic; see `schema.ts` for why. Whichever ports end up empty cause the executor's
 * generic empty-input skip rule to skip whatever is wired to them.
 */
export const switchNode = defineNode({
  type: 'logic.switch',
  displayName: 'Switch',
  description:
    'Routes each item to the output port matching one of up to five configured case values (field equality), falling back to "default" when nothing matches.',
  category: 'logic',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [
    ...CASE_PORT_IDS.map((id, i) => ({ id, label: `Case ${i}` })),
    { id: DEFAULT_PORT_ID, label: 'Default' },
  ],
  paramsSchema: switchParamsSchema,
  async run(ctx) {
    const output: PortItems = Object.fromEntries([...CASE_PORT_IDS, DEFAULT_PORT_ID].map((id) => [id, []]));
    for (const item of ctx.input.main ?? []) {
      const port = routeItem(item, ctx.params);
      (output[port] ??= []).push(item);
    }
    return output;
  },
});
