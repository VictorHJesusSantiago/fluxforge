import { z } from '@fluxforge/sdk';

export const setParamsSchema = z.object({
  /** Fields to add or overwrite on every item, applied after `remove`. */
  set: z.record(z.string(), z.unknown()).default({}),
  /** Field names to delete from every item, applied before `set`. */
  remove: z.array(z.string()).default([]),
});

export type SetParams = z.infer<typeof setParamsSchema>;
