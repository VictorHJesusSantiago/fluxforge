import { z } from '@fluxforge/sdk';

/**
 * The same small condition vocabulary as `logic.if` (see `@fluxforge/node-if`'s `schema.ts` for
 * the rationale). Duplicated here rather than imported — each node package depends on nothing but
 * `@fluxforge/sdk`, per that package's own stated design goal (see its `index.ts` doc comment), so
 * a workflow using only `logic.filter` never pulls in `@fluxforge/node-if`'s code.
 */
export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'greaterThan',
  'lessThan',
  'isEmpty',
  'isNotEmpty',
] as const;

export const filterParamsSchema = z.object({
  field: z.string().min(1).describe('Dot-free key to read from each item.'),
  operator: z.enum(CONDITION_OPERATORS),
  /** Unused by `isEmpty`/`isNotEmpty`, which take no comparison value. */
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type FilterParams = z.infer<typeof filterParamsSchema>;
