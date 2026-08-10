import { z } from '@fluxforge/sdk';

export const googleSheetsAppendParamsSchema = z.object({
  spreadsheetId: z.string().min(1),
  /** An A1 notation range, e.g. `"Sheet1!A:Z"`. The Sheets API appends after the last row within
   *  this range that has data. */
  range: z.string().min(1),
  /** One row's worth of cell values, in column order. */
  values: z.array(z.union([z.string(), z.number(), z.boolean()])),
});

export type GoogleSheetsAppendParams = z.infer<typeof googleSheetsAppendParamsSchema>;
