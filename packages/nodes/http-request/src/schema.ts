import { z } from '@fluxforge/sdk';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const httpRequestParamsSchema = z.object({
  url: z.string().url(),
  method: z.enum(HTTP_METHODS).default('GET'),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.string()).default({}),
  /** Sent as JSON if it's an object/array, as-is if it's already a string. Ignored for GET. */
  body: z.unknown().optional(),
  timeoutMs: z.number().int().positive().default(10_000),
  /**
   * A non-2xx response normally throws (so the executor's retry/backoff applies to it exactly
   * like a network error) — set this to route the error status into the output instead, for a
   * workflow that wants to branch on "did the API call succeed" itself.
   */
  ignoreHttpErrors: z.boolean().default(false),
  /** A credential name whose `token` field is sent as `Authorization: Bearer <token>`. */
  credential: z.string().optional(),
});

export type HttpRequestParams = z.infer<typeof httpRequestParamsSchema>;
