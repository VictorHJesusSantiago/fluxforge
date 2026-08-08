import { z } from '@fluxforge/sdk';

export const discordWebhookParamsSchema = z.object({
  /** The full Discord webhook URL — treated as a secret (no OAuth, the URL is the credential). */
  webhookUrl: z.string().url(),
  content: z.string(),
  username: z.string().optional(),
});

export type DiscordWebhookParams = z.infer<typeof discordWebhookParamsSchema>;
