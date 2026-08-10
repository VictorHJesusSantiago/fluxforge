import { z } from '@fluxforge/sdk';

/**
 * A manual trigger takes no configuration — it exists purely to mark "this workflow starts when
 * a person clicks run," not on a schedule or webhook. The empty object is intentional, not a
 * placeholder.
 */
export const manualParamsSchema = z.object({});

export type ManualParams = z.infer<typeof manualParamsSchema>;
