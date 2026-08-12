import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistentQueue } from '../queue.js';
import { QueueWorker } from '../worker.js';

let queue: PersistentQueue;

beforeEach(() => {
  queue = new PersistentQueue(':memory:');
});

afterEach(() => {
  queue.close();
});

// A same-tick microtask (`Promise.resolve()`) would never yield to the macrotask queue when the
// worker loop is idle-polling — it would win a livelock against the event loop's timer phase
// forever, starving out every `setTimeout` in the test (including `vi.waitFor`'s own polling and
// `worker.stop()`'s wait for the loop to notice `stopped`). A zero-delay real timer still yields.
const instantSleep = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('QueueWorker', () => {
  it('claims and completes a job on handler success', async () => {
    const id = queue.enqueue('t', { n: 1 });
    const seen: unknown[] = [];
    const worker = new QueueWorker(
      queue,
      async (job) => {
        seen.push(job.payload);
      },
      { visibilityTimeoutMs: 5000, pollIntervalMs: 1, sleep: instantSleep },
    );

    worker.start();
    // Give the loop a few real microtask/timer turns to actually process the one job.
    await vi.waitFor(() => expect(queue.getJob(id)?.status).toBe('done'));
    await worker.stop();

    expect(seen).toEqual([{ n: 1 }]);
  });

  it('fails the job when the handler throws, which schedules a retry', async () => {
    const id = queue.enqueue('t', {}, { maxAttempts: 2, backoff: 'fixed', baseDelayMs: 0 });
    let calls = 0;
    const worker = new QueueWorker(
      queue,
      async () => {
        calls += 1;
        throw new Error('handler exploded');
      },
      { visibilityTimeoutMs: 5000, pollIntervalMs: 1, sleep: instantSleep },
    );

    worker.start();
    await vi.waitFor(() => expect(queue.getJob(id)?.status).toBe('dead'));
    await worker.stop();

    expect(calls).toBe(2);
    expect(queue.getJob(id)?.lastError).toBe('handler exploded');
  });

  it('stop() waits for the in-flight handler to finish before returning', async () => {
    queue.enqueue('t', {});
    let finished = false;
    const worker = new QueueWorker(
      queue,
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        finished = true;
      },
      { visibilityTimeoutMs: 5000, pollIntervalMs: 1, sleep: instantSleep },
    );

    worker.start();
    await new Promise((r) => setTimeout(r, 5)); // let it claim and start the handler
    await worker.stop();

    expect(finished).toBe(true);
  });

  it('an idle worker polls without claiming anything', async () => {
    const worker = new QueueWorker(queue, async () => {}, {
      visibilityTimeoutMs: 5000,
      pollIntervalMs: 1,
      sleep: instantSleep,
    });
    worker.start();
    await new Promise((r) => setTimeout(r, 10));
    await worker.stop();

    expect(queue.countByStatus('pending')).toBe(0);
    expect(queue.countByStatus('done')).toBe(0);
  });
});
