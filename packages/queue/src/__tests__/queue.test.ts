import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersistentQueue } from '../queue.js';

let clock = 1_000_000;
const now = () => clock;
let queue: PersistentQueue;

beforeEach(() => {
  clock = 1_000_000;
  queue = new PersistentQueue(':memory:', { now, idGenerator: (() => {
    let n = 0;
    return () => `job-${(n += 1)}`;
  })() });
});

afterEach(() => {
  queue.close();
});

describe('enqueue / claim / complete', () => {
  it('claims an enqueued job and marks it done on complete', () => {
    const id = queue.enqueue('send-email', { to: 'a@b.com' });
    const claimed = queue.claim(5000);

    expect(claimed?.id).toBe(id);
    expect(claimed?.payload).toEqual({ to: 'a@b.com' });
    expect(claimed?.attempts).toBe(1);

    queue.complete(id);
    expect(queue.getJob(id)?.status).toBe('done');
  });

  it('returns undefined when nothing is claimable', () => {
    expect(queue.claim(1000)).toBeUndefined();
  });

  it('a delayed job is not claimable until its delay elapses', () => {
    queue.enqueue('later', {}, { delayMs: 10_000 });
    expect(queue.claim(1000)).toBeUndefined();

    clock += 10_000;
    expect(queue.claim(1000)?.type).toBe('later');
  });

  it('claim() respects FIFO order by visibility time', () => {
    const first = queue.enqueue('t', { n: 1 });
    clock += 1;
    queue.enqueue('t', { n: 2 });

    expect(queue.claim(1000)?.id).toBe(first);
  });

  it('filters by type when given one', () => {
    queue.enqueue('a', { n: 1 });
    const bId = queue.enqueue('b', { n: 2 });

    const claimed = queue.claim(1000, 'b');
    expect(claimed?.id).toBe(bId);
  });
});

describe('visibility timeout — crash recovery', () => {
  it('a claimed-but-never-acked job becomes claimable again after the timeout', () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 5 });
    const first = queue.claim(1000);
    expect(first?.id).toBe(id);

    expect(queue.claim(1000)).toBeUndefined();

    clock += 1001;
    const redelivered = queue.claim(1000);
    expect(redelivered?.id).toBe(id);
    expect(redelivered?.attempts).toBe(2);
  });

  it('release() makes a claimed job immediately visible again without counting as a failure', () => {
    const id = queue.enqueue('t', {});
    queue.claim(5000);
    queue.release(id);

    const reclaimed = queue.claim(5000);
    expect(reclaimed?.id).toBe(id);
  });

  it('a job exceeding maxAttempts via repeated crash-redelivery is auto-dead-lettered by claim()', () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 2 });
    queue.claim(100);
    clock += 101;
    queue.claim(100);
    clock += 101;

    expect(queue.claim(100)).toBeUndefined();
    expect(queue.getJob(id)?.status).toBe('dead');
  });
});

describe('fail() — retry scheduling and dead-lettering', () => {
  it('reschedules with backoff when attempts remain', () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 3, backoff: 'fixed', baseDelayMs: 500 });
    queue.claim(10_000);

    const result = queue.fail(id, 'boom');
    expect(result).toBe('retrying');
    expect(queue.getJob(id)?.status).toBe('pending');
    expect(queue.getJob(id)?.lastError).toBe('boom');

    expect(queue.claim(1000)).toBeUndefined();
    clock += 500;
    expect(queue.claim(1000)?.id).toBe(id);
  });

  it('dead-letters once maxAttempts is exhausted', () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 1 });
    queue.claim(10_000);

    const result = queue.fail(id, 'permanent');
    expect(result).toBe('dead');
    expect(queue.getJob(id)?.status).toBe('dead');
    expect(queue.deadLetter().map((j) => j.id)).toContain(id);
  });

  it('requeue() resets a dead job to a fresh, immediately-claimable attempt cycle', () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 1 });
    queue.claim(10_000);
    queue.fail(id, 'permanent');
    expect(queue.getJob(id)?.status).toBe('dead');

    queue.requeue(id);
    expect(queue.getJob(id)?.status).toBe('pending');
    expect(queue.getJob(id)?.attempts).toBe(0);
    expect(queue.claim(1000)?.id).toBe(id);
  });

  it('throws for an unknown job id', () => {
    expect(() => queue.fail('nope', 'x')).toThrow(/no such job/);
  });
});

describe('countByStatus', () => {
  it('reflects pending/done/dead counts accurately', () => {
    const a = queue.enqueue('t', {}, { maxAttempts: 1 });
    const b = queue.enqueue('t', {}, { maxAttempts: 1 });
    queue.enqueue('t', {});

    queue.claim(1000);
    queue.complete(a);
    queue.claim(1000);
    queue.fail(b, 'dead now');

    expect(queue.countByStatus('done')).toBe(1);
    expect(queue.countByStatus('dead')).toBe(1);
    expect(queue.countByStatus('pending')).toBe(1);
  });
});

describe('persistence — surviving a reconnect', () => {
  it('reopening the same file sees jobs enqueued before close', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fluxforge-queue-'));
    const dbPath = join(dir, 'jobs.sqlite');

    const first = new PersistentQueue(dbPath);
    const id = first.enqueue('persisted', { ok: true });
    first.close();

    const second = new PersistentQueue(dbPath);
    const claimed = second.claim(1000);
    expect(claimed?.id).toBe(id);
    expect(claimed?.payload).toEqual({ ok: true });
    second.close();

    rmSync(dir, { recursive: true, force: true });
  });
});
