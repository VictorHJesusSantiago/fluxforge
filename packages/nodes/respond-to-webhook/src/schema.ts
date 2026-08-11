import { z } from '@fluxforge/sdk';

export const respondToWebhookParamsSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200),
  body: z.unknown().optional(),
});

export type RespondToWebhookParams = z.infer<typeof respondToWebhookParamsSchema>;
