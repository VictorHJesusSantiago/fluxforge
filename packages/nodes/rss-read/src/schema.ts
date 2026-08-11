import { z } from '@fluxforge/sdk';

export const rssReadParamsSchema = z.object({
  url: z.string().url(),
});

export type RssReadParams = z.infer<typeof rssReadParamsSchema>;
