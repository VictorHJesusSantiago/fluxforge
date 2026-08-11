import { z } from '@fluxforge/sdk';

export const slackWebhookParamsSchema = z.object({
  /** The full Slack "Incoming Webhook" URL — treated as a secret even though it's a plain param
   *  (Slack's own docs model it this way: no OAuth token, the URL itself is the credential). */
  webhookUrl: z.string().url(),
  text: z.string(),
  channel: z.string().optional(),
  username: z.string().optional(),
});

export type SlackWebhookParams = z.infer<typeof slackWebhookParamsSchema>;
