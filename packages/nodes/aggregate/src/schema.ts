import { z } from '@fluxforge/sdk';

export const AGGREGATE_OPERATIONS = ['sum', 'count', 'avg', 'min', 'max'] as const;

export const aggregateParamsSchema = z.object({
  /** The numeric field to aggregate. */
  field: z.string().min(1),
  operations: z.array(z.enum(AGGREGATE_OPERATIONS)).min(1),
  /** When set, one output item is produced per distinct value of this field instead of one overall. */
  groupBy: z.string().min(1).optional(),
});

export type AggregateParams = z.infer<typeof aggregateParamsSchema>;
