import { z } from '@fluxforge/sdk';

/**
 * A deliberately small condition language — one field, one operator, one comparison value —
 * rather than an embedded expression evaluator. `data.code` (a different node) is where
 * arbitrary logic belongs; a branch condition being restricted to "one field compared one way"
 * is what makes it safe to render as a three-field form in the editor with no code widget.
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

export const ifParamsSchema = z.object({
  field: z.string().min(1).describe('Dot-free key to read from each item.'),
  operator: z.enum(CONDITION_OPERATORS),
  /** Unused by `isEmpty`/`isNotEmpty`, which take no comparison value. */
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type IfParams = z.infer<typeof ifParamsSchema>;
