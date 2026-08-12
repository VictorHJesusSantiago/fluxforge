import { z } from '@fluxforge/sdk';

export const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Purely declarative: `path` and `method` describe which incoming HTTP request should trigger
 * this workflow. Matching the request to the workflow and parsing it into `PortItems` is
 * `@fluxforge/server`'s job (being built in parallel) — this node only carries the shape.
 */
export const webhookParamsSchema = z.object({
  path: z.string().min(1).describe('URL path segment this webhook listens on, e.g. "/hooks/orders".'),
  method: z.enum(WEBHOOK_METHODS).default('POST'),
});

export type WebhookParams = z.infer<typeof webhookParamsSchema>;
