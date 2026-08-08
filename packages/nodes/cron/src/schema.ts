import { z } from '@fluxforge/sdk';
import { parseCron } from './cron.js';

export const cronParamsSchema = z.object({
  expression: z
    .string()
    .min(1)
    .describe('Standard 5-field cron expression: minute hour day-of-month month day-of-week.')
    .refine(
      (expression) => {
        try {
          parseCron(expression);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'not a valid 5-field cron expression' },
    ),
  /**
   * Accepted but not honored beyond the literal string — see `cron.ts`'s module doc for why: this
   * node's (and `nextFireTime`'s) calculations are UTC-only for now. Recording the intended
   * timezone here means a future scheduler upgrade can start honoring it without a params-schema
   * migration.
   */
  timezone: z.string().min(1).default('UTC'),
});

export type CronParams = z.infer<typeof cronParamsSchema>;
