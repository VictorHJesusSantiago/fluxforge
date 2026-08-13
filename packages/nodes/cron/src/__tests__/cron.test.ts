import { describe, it, expect } from 'vitest';
import { parseCron, nextFireTime, CronParseError } from '../cron.js';

describe('parseCron', () => {
  it('parses "*" as the full range for each field', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.minute.values.size).toBe(60);
    expect(parsed.hour.values.size).toBe(24);
    expect(parsed.dayOfMonth.values.size).toBe(31);
    expect(parsed.month.values.size).toBe(12);
    expect(parsed.dayOfWeek.values.size).toBe(7);
    expect(parsed.minute.wildcard).toBe(true);
  });

  it('parses exact numbers', () => {
    const parsed = parseCron('30 9 15 6 3');
    expect([...parsed.minute.values]).toEqual([30]);
    expect([...parsed.hour.values]).toEqual([9]);
    expect([...parsed.dayOfMonth.values]).toEqual([15]);
    expect([...parsed.month.values]).toEqual([6]);
    expect([...parsed.dayOfWeek.values]).toEqual([3]);
  });

  it('parses comma-lists', () => {
    const parsed = parseCron('1,15,30 * * * *');
    expect([...parsed.minute.values]).toEqual([1, 15, 30]);
  });

  it('parses ranges', () => {
    const parsed = parseCron('* * * * 1-5');
    expect([...parsed.dayOfWeek.values]).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.dayOfWeek.wildcard).toBe(false);
  });

  it('parses step values over the full range', () => {
    const parsed = parseCron('*/15 * * * *');
    expect([...parsed.minute.values]).toEqual([0, 15, 30, 45]);
  });

  it('parses a stepped range', () => {
    const parsed = parseCron('0-30/10 * * * *');
    expect([...parsed.minute.values]).toEqual([0, 10, 20, 30]);
  });

  it('rejects the wrong number of fields', () => {
    expect(() => parseCron('* * * *')).toThrow(CronParseError);
    expect(() => parseCron('* * * * * *')).toThrow(CronParseError);
  });

  it('rejects an out-of-bounds value', () => {
    expect(() => parseCron('60 * * * *')).toThrow(CronParseError);
    expect(() => parseCron('* 24 * * *')).toThrow(CronParseError);
    expect(() => parseCron('* * 0 * *')).toThrow(CronParseError);
    expect(() => parseCron('* * * 13 *')).toThrow(CronParseError);
    expect(() => parseCron('* * * * 7')).toThrow(CronParseError);
  });

  it('rejects garbage text', () => {
    expect(() => parseCron('a b c d e')).toThrow(CronParseError);
  });

  it('rejects an inverted range', () => {
    expect(() => parseCron('30-10 * * * *')).toThrow(CronParseError);
  });
});

describe('nextFireTime', () => {
  it('every-minute expression fires on the very next minute boundary', () => {
    const after = new Date('2026-08-06T10:15:30.000Z');
    const next = nextFireTime('* * * * *', after);
    expect(next.toISOString()).toBe('2026-08-06T10:16:00.000Z');
  });

  it('a specific daily time fires at that time, today if not yet passed', () => {
    const after = new Date('2026-08-06T05:00:00.000Z');
    const next = nextFireTime('0 9 * * *', after);
    expect(next.toISOString()).toBe('2026-08-06T09:00:00.000Z');
  });

  it('a specific daily time rolls to tomorrow if already passed today', () => {
    const after = new Date('2026-08-06T10:00:00.000Z');
    const next = nextFireTime('0 9 * * *', after);
    expect(next.toISOString()).toBe('2026-08-07T09:00:00.000Z');
  });

  it('a step schedule fires on the next step boundary', () => {
    const after = new Date('2026-08-06T10:16:00.000Z');
    const next = nextFireTime('*/15 * * * *', after);
    expect(next.toISOString()).toBe('2026-08-06T10:30:00.000Z');
  });

  it('a step schedule exactly on a boundary still advances to the next one (strictly after)', () => {
    const after = new Date('2026-08-06T10:30:00.000Z');
    const next = nextFireTime('*/15 * * * *', after);
    expect(next.toISOString()).toBe('2026-08-06T10:45:00.000Z');
  });

  it('a day-of-week restriction skips the weekend (2026-08-06 is a Thursday)', () => {
    const after = new Date('2026-08-07T09:05:00.000Z');
    const next = nextFireTime('0 9 * * 1-5', after);
    expect(next.toISOString()).toBe('2026-08-10T09:00:00.000Z');
    expect(next.getUTCDay()).toBe(1);
  });

  it('a day-of-week restriction fires same day if the time has not yet passed', () => {
    const after = new Date('2026-08-06T00:00:00.000Z');
    const next = nextFireTime('0 9 * * 1-5', after);
    expect(next.toISOString()).toBe('2026-08-06T09:00:00.000Z');
  });

  it('rolls over a month boundary', () => {
    const after = new Date('2026-01-31T23:59:00.000Z');
    const next = nextFireTime('0 0 1 * *', after);
    expect(next.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('rolls over a year boundary', () => {
    const after = new Date('2026-12-31T23:59:00.000Z');
    const next = nextFireTime('0 0 1 1 *', after);
    expect(next.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles a schedule pinned to Feb 29, skipping non-leap years', () => {
    const after = new Date('2026-03-01T00:00:00.000Z');
    const next = nextFireTime('0 0 29 2 *', after);
    expect(next.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('applies OR semantics when both day-of-month and day-of-week are restricted', () => {
    const after = new Date('2026-08-06T00:00:00.000Z');
    const next = nextFireTime('0 0 1 * 1', after);
    expect(next.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('throws when the expression can never fire (Feb 30th does not exist)', () => {
    expect(() => nextFireTime('0 0 30 2 *', new Date('2026-01-01T00:00:00.000Z'))).toThrow();
  });
});
