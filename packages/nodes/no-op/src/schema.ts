import { z } from '@fluxforge/sdk';

/** No parameters — this node has nothing to configure. */
export const noOpParamsSchema = z.object({});

export type NoOpParams = z.infer<typeof noOpParamsSchema>;
