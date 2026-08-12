import { z } from '@fluxforge/sdk';

/**
 * `@fluxforge/sdk`'s `NodeDefinitionInput.outputs` (see `packages/sdk/src/types.ts`) is a static
 * array fixed at `defineNode` call time — there is no mechanism for a node to declare "N ports,
 * where N depends on my own params" (the editor/registry read `outputs` off the frozen
 * `NodeDefinition` before any params exist). Genuinely dynamic ports aren't supported by the
 * current SDK shape, and this node package must not modify `@fluxforge/sdk` itself (its contract
 * is relied on elsewhere). So `logic.switch` declares a fixed small set of case ports up front —
 * `case-0` through `case-4` (five cases) plus `default` — and a case's `output` field is
 * constrained to one of those ids. A workflow needing more than five distinct branches chains a
 * second `logic.switch` off the first's `default` port.
 */
export const MAX_CASES = 5;
export const CASE_PORT_IDS = Array.from({ length: MAX_CASES }, (_, i) => `case-${i}`) as [string, ...string[]];
export const DEFAULT_PORT_ID = 'default';

export const switchCaseSchema = z.object({
  /** The value compared against `item[field]` with strict equality. */
  value: z.union([z.string(), z.number(), z.boolean()]),
  /** Which fixed port this case routes matching items to. */
  output: z.enum(CASE_PORT_IDS as [string, ...string[]]),
});

export const switchParamsSchema = z.object({
  field: z.string().min(1).describe('Dot-free key to read from each item.'),
  cases: z.array(switchCaseSchema).max(MAX_CASES),
});

export type SwitchCase = z.infer<typeof switchCaseSchema>;
export type SwitchParams = z.infer<typeof switchParamsSchema>;
