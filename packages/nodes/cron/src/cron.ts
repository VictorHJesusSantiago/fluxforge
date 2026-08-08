/**
 * A hand-written 5-field cron expression parser and `nextFireTime` calculator, kept apart from
 * `runtime.ts` (mirroring how `@fluxforge/node-http-request` keeps `request.ts` apart from
 * `runtime.ts`) so the actual scheduling math is a pure, directly-testable module with zero
 * dependency on `@fluxforge/sdk` or the node execution context.
 *
 * **Timezone limitation, stated plainly**: every calculation here is done in UTC via `Date`'s
 * `getUTC*`/`Date.UTC` methods. There is no real timezone-database (IANA tz) handling — a
 * `timezone` value other than `"UTC"` is accepted by the node's params schema (so a workflow
 * author can record their intent and a future version can honor it) but is **not** applied to the
 * calculation. Only UTC is genuinely honored right now.
 *
 * Standard 5-field syntax: `minute hour day-of-month month day-of-week`.
 *   minute       0-59
 *   hour         0-23
 *   day-of-month 1-31
 *   month        1-12
 *   day-of-week  0-6 (0 = Sunday)
 * Each field accepts `*`, an exact number, a comma-list (`1,15,30`), a range (`1-5`), a step
 * (`*​/15`), or a stepped range (`1-10/2`) — the common subset every cron implementation agrees on.
 *
 * When *both* day-of-month and day-of-week are restricted (neither is `*`), standard cron OR
 * semantics apply: a date matches if it satisfies either field, not both — e.g. `0 9 1 * 1` fires
 * on the 1st of the month AND every Monday, not only Mondays that happen to be the 1st.
 */

export interface CronField {
  values: Set<number>;
  /** True only if the original field text was exactly `"*"` — needed for day-of-month/day-of-week
   *  OR-semantics, which a full-range value like `0-6` must NOT trigger. */
  wildcard: boolean;
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const FIELD_BOUNDS = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
} as const;

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

function parsePart(part: string, min: number, max: number, fieldName: string): number[] {
  const [rangeOrStar = '', stepText] = part.split('/');
  const step = stepText === undefined ? 1 : Number(stepText);
  if (!Number.isInteger(step) || step <= 0) {
    throw new CronParseError(`cron ${fieldName}: invalid step in "${part}"`);
  }

  let lo: number;
  let hi: number;
  if (rangeOrStar === '*') {
    lo = min;
    hi = max;
  } else if (rangeOrStar.includes('-')) {
    const [loText = '', hiText = ''] = rangeOrStar.split('-');
    lo = Number(loText);
    hi = Number(hiText);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) {
      throw new CronParseError(`cron ${fieldName}: invalid range "${rangeOrStar}"`);
    }
  } else {
    lo = hi = Number(rangeOrStar);
    if (!Number.isInteger(lo)) {
      throw new CronParseError(`cron ${fieldName}: invalid value "${rangeOrStar}"`);
    }
  }

  if (lo < min || hi > max) {
    throw new CronParseError(`cron ${fieldName}: "${part}" out of bounds [${min}, ${max}]`);
  }

  const values: number[] = [];
  for (let v = lo; v <= hi; v += step) values.push(v);
  return values;
}

function parseField(text: string, fieldName: keyof typeof FIELD_BOUNDS): CronField {
  const [min, max] = FIELD_BOUNDS[fieldName];
  const values = new Set<number>();
  for (const part of text.split(',')) {
    if (part.trim() === '') {
      throw new CronParseError(`cron ${fieldName}: empty field part in "${text}"`);
    }
    for (const v of parsePart(part.trim(), min, max, fieldName)) values.add(v);
  }
  return { values, wildcard: text.trim() === '*' };
}

/** Parses a 5-field cron expression. Throws `CronParseError` on anything malformed. */
export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `cron expression must have exactly 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}: "${expression}"`,
    );
  }
  const [minute = '', hour = '', dayOfMonth = '', month = '', dayOfWeek = ''] = fields;
  return {
    minute: parseField(minute, 'minute'),
    hour: parseField(hour, 'hour'),
    dayOfMonth: parseField(dayOfMonth, 'dayOfMonth'),
    month: parseField(month, 'month'),
    dayOfWeek: parseField(dayOfWeek, 'dayOfWeek'),
  };
}

function matchesDay(parsed: ParsedCron, dayOfMonth: number, dayOfWeek: number): boolean {
  const domMatch = parsed.dayOfMonth.values.has(dayOfMonth);
  const dowMatch = parsed.dayOfWeek.values.has(dayOfWeek);
  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) return true;
  if (parsed.dayOfMonth.wildcard) return dowMatch;
  if (parsed.dayOfWeek.wildcard) return domMatch;
  // Both restricted: standard cron OR semantics.
  return domMatch || dowMatch;
}

/**
 * The next UTC minute, strictly after `after`, that satisfies `expression`. Steps field-by-field
 * (jump to the next valid month/day/hour/minute rather than scanning minute-by-minute) so a
 * multi-year gap — e.g. "next February 30th" style sparse schedules — resolves in a handful of
 * iterations instead of millions.
 */
export function nextFireTime(expression: string, after: Date): Date {
  const parsed = parseCron(expression);

  let t = new Date(Date.UTC(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
    after.getUTCHours(),
    after.getUTCMinutes(),
  ) + 60_000); // truncate to the minute, then move to the next one

  const startYear = after.getUTCFullYear();
  const maxYear = startYear + 5; // safety cap — a schedule that never matches within 5 years is malformed

  for (;;) {
    if (t.getUTCFullYear() > maxYear) {
      throw new CronParseError(`cron expression "${expression}" does not fire within 5 years of ${after.toISOString()}`);
    }

    if (!parsed.month.values.has(t.getUTCMonth() + 1)) {
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1, 0, 0));
      continue;
    }

    if (!matchesDay(parsed, t.getUTCDate(), t.getUTCDay())) {
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 0, 0));
      continue;
    }

    if (!parsed.hour.values.has(t.getUTCHours())) {
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours() + 1, 0));
      continue;
    }

    if (!parsed.minute.values.has(t.getUTCMinutes())) {
      t = new Date(t.getTime() + 60_000);
      continue;
    }

    return t;
  }
}
