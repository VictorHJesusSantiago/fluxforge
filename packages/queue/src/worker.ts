import type { PersistentQueue } from './queue.js';
import type { ClaimedJob } from './types.js';

export interface WorkerOptions {
  /** How long a claim holds a job invisible before it's assumed crashed and redelivered. */
  visibilityTimeoutMs: number;
  /** How often to poll when the queue was empty last time. */
  pollIntervalMs: number;
  /** Restrict this worker to one job type, or leave undefined to drain every type. */
  type?: string;
  /** Injectable for tests; defaults to a real `setTimeout`-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A minimal poll loop: claim, run the handler, ack. `stop()` lets the current job finish (it
 * does not abort mid-handler — a queue worker that kills in-flight work on shutdown is how you
 * lose data the visibility timeout was supposed to protect) and then exits the loop.
 */
export class QueueWorker {
  private stopped = false;
  private loopPromise: Promise<void> | undefined;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly queue: PersistentQueue,
    private readonly handler: JobHandler,
    private readonly options: WorkerOptions,
  ) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  start(): void {
    if (this.loopPromise !== undefined) return;
    this.stopped = false;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const job = this.queue.claim(this.options.visibilityTimeoutMs, this.options.type);
      if (job === undefined) {
        await this.sleep(this.options.pollIntervalMs);
        continue;
      }

      try {
        await this.handler(job);
        this.queue.complete(job.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.queue.fail(job.id, message);
      }
    }
  }
}
