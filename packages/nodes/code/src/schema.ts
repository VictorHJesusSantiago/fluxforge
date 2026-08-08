import { z } from '@fluxforge/sdk';

export const codeParamsSchema = z.object({
  /**
   * A JavaScript expression, evaluated once per item with `item` and `index` in scope. Its value
   * becomes the new item, e.g. `"({...item, upper: item.name.toUpperCase()})"`.
   */
  expression: z.string().min(1),
});

export type CodeParams = z.infer<typeof codeParamsSchema>;
