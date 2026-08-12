import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { calculateBackoffDelay, type RetryPolicy } from '@fluxforge/core';
import type { ClaimedJob, EnqueueOptions, JobRecord, JobStatus } from './types.js';

interface QueueOptions {
  /** Injectable clock, epoch milliseconds — what makes visibility-timeout tests instant. */
  now?: () => number;
  idGenerator?: () => string;
}

interface JobRow {
  id: string;
  type: string;
  payload: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  backoff_kind: 'fixed' | 'exponential';
  base_delay_ms: number;
  max_delay_ms: number | null;
  visible_at: number;
  created_at: number;
  updated_at: number;
  last_error: string | null;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    visibleAt: row.visible_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error ?? undefined,
  };
}

/**
 * A persistent job queue on SQLite (`better-sqlite3` — synchronous, so every method here is
 * synchronous too; there is no async work to do until a worker actually runs a job's handler).
 *
 * **Visibility-timeout model**, the same one SQS uses, chosen over a separate `running` status
 * table because it makes crash recovery free: a claimed job stays `status = 'pending'` with
 * `visible_at` pushed into the future. If the worker that claimed it dies before calling
 * `complete`/`fail`, no reconciliation pass is needed — `visible_at` simply expires and the next
 * `claim()` picks it back up, incrementing `attempts` again. `attempts` is therefore a *delivery*
 * count (SQS's `ApproximateReceiveCount`), not a completed-execution count; a worker that keeps
 * crashing without ever calling `fail()` still eventually exhausts `maxAttempts` and gets
 * dead-lettered by `claim()` itself, not by a background sweep.
 *
 * **Cross-process safety.** `claim()` runs inside a `BEGIN IMMEDIATE` transaction, not the
 * plain deferred one `db.transaction()` defaults to — deferred transactions only take the write
 * lock at the first write, which leaves a window between "SELECT the oldest visible job" and
 * "UPDATE it" where a second process's SELECT could return the same row. `IMMEDIATE` takes the
 * lock up front, so two processes sharing one SQLite file never double-claim.
 */
export class PersistentQueue {
  private readonly db: Database.Database;
  private readonly now: () => number;
  private readonly idGenerator: () => string;

  constructor(dbPath: string, options: QueueOptions = {}) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.now = options.now ?? (() => Date.now());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        backoff_kind TEXT NOT NULL DEFAULT 'fixed',
        base_delay_ms INTEGER NOT NULL DEFAULT 0,
        max_delay_ms INTEGER,
        visible_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, visible_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
    `);
  }

  /** @returns the new job's id. */
  enqueue(type: string, payload: unknown, options: EnqueueOptions = {}): string {
    const id = this.idGenerator();
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, type, payload, status, attempts, max_attempts, backoff_kind, base_delay_ms, max_delay_ms, visible_at, created_at, updated_at, last_error)
         VALUES (@id, @type, @payload, 'pending', 0, @maxAttempts, @backoffKind, @baseDelayMs, @maxDelayMs, @visibleAt, @now, @now, NULL)`,
      )
      .run({
        id,
        type,
        payload: JSON.stringify(payload),
        maxAttempts: options.maxAttempts ?? 1,
        backoffKind: options.backoff ?? 'fixed',
        baseDelayMs: options.baseDelayMs ?? 0,
        maxDelayMs: options.maxDelayMs ?? null,
        visibleAt: now + (options.delayMs ?? 0),
        now,
      });
    return id;
  }

  /**
   * Atomically claims the oldest visible pending job of any type (or a specific `type`, if
   * given) and pushes its visibility out by `visibilityTimeoutMs`. Returns `undefined` if
   * nothing is claimable right now.
   */
  claim(visibilityTimeoutMs: number, type?: string): ClaimedJob | undefined {
    const claimTx = this.db.transaction((): ClaimedJob | undefined => {
      const now = this.now();
      const row = (
        type === undefined
          ? this.db
              .prepare<{ now: number }, JobRow>(
                `SELECT * FROM jobs WHERE status = 'pending' AND visible_at <= @now ORDER BY visible_at ASC LIMIT 1`,
              )
              .get({ now })
          : this.db
              .prepare<{ now: number; type: string }, JobRow>(
                `SELECT * FROM jobs WHERE status = 'pending' AND visible_at <= @now AND type = @type ORDER BY visible_at ASC LIMIT 1`,
              )
              .get({ now, type })
      ) as JobRow | undefined;

      if (row === undefined) return undefined;

      const nextAttempts = row.attempts + 1;
      if (nextAttempts > row.max_attempts) {
        // Redelivered more times than allowed without ever being acked — dead-letter it here
        // rather than handing it to yet another worker. Not claimed; loop the caller can call
        // claim() again for the next candidate.
        this.db
          .prepare(`UPDATE jobs SET status = 'dead', attempts = @attempts, updated_at = @now WHERE id = @id`)
          .run({ id: row.id, attempts: nextAttempts, now });
        return claimTx();
      }

      this.db
        .prepare(
          `UPDATE jobs SET attempts = @attempts, visible_at = @visibleAt, updated_at = @now WHERE id = @id`,
        )
        .run({ id: row.id, attempts: nextAttempts, visibleAt: now + visibilityTimeoutMs, now });

      return {
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload) as unknown,
        attempts: nextAttempts,
      };
    });

    return claimTx.immediate();
  }

  /** Mark a claimed job done. */
  complete(jobId: string): void {
    this.db
      .prepare(`UPDATE jobs SET status = 'done', updated_at = @now WHERE id = @id`)
      .run({ id: jobId, now: this.now() });
  }

  /**
   * Report a claimed job's handler as having failed. Reschedules with backoff if attempts
   * remain, otherwise dead-letters it. Returns which happened, so a worker can log accordingly.
   */
  fail(jobId: string, error: string, retryPolicyOverride?: RetryPolicy): 'retrying' | 'dead' {
    const row = this.db.prepare<{ id: string }, JobRow>(`SELECT * FROM jobs WHERE id = @id`).get({
      id: jobId,
    }) as JobRow | undefined;
    if (row === undefined) throw new Error(`PersistentQueue.fail: no such job "${jobId}"`);

    const now = this.now();
    if (row.attempts >= row.max_attempts) {
      this.db
        .prepare(`UPDATE jobs SET status = 'dead', last_error = @error, updated_at = @now WHERE id = @id`)
        .run({ id: jobId, error, now });
      return 'dead';
    }

    const policy: RetryPolicy = retryPolicyOverride ?? {
      maxAttempts: row.max_attempts,
      backoff: row.backoff_kind,
      baseDelayMs: row.base_delay_ms,
      ...(row.max_delay_ms === null ? {} : { maxDelayMs: row.max_delay_ms }),
    };
    const delayMs = calculateBackoffDelay(row.attempts, policy);
    this.db
      .prepare(
        `UPDATE jobs SET visible_at = @visibleAt, last_error = @error, updated_at = @now WHERE id = @id`,
      )
      .run({ id: jobId, visibleAt: now + delayMs, error, now });
    return 'retrying';
  }

  /**
   * Make a claimed job immediately visible again, without counting it as a failure — for a
   * graceful worker shutdown ("I was asked to stop, this job didn't fail, give it back") as
   * opposed to a crash or an explicit `fail()`. `claim()` increments `attempts` optimistically
   * before the handler even runs, so releasing has to undo that increment; otherwise a job that
   * is released `maxAttempts` times, never actually failing, would be wrongly dead-lettered by
   * `claim()`'s own redelivery-count check.
   */
  release(jobId: string): void {
    const now = this.now();
    this.db
      .prepare(
        `UPDATE jobs SET attempts = MAX(attempts - 1, 0), visible_at = @now, updated_at = @now WHERE id = @id`,
      )
      .run({ id: jobId, now });
  }

  getJob(jobId: string): JobRecord | undefined {
    const row = this.db.prepare<{ id: string }, JobRow>(`SELECT * FROM jobs WHERE id = @id`).get({
      id: jobId,
    }) as JobRow | undefined;
    return row === undefined ? undefined : rowToRecord(row);
  }

  countByStatus(status: JobStatus): number {
    const row = this.db
      .prepare<{ status: JobStatus }, { n: number }>(`SELECT COUNT(*) as n FROM jobs WHERE status = @status`)
      .get({ status }) as { n: number };
    return row.n;
  }

  deadLetter(): JobRecord[] {
    const rows = this.db.prepare(`SELECT * FROM jobs WHERE status = 'dead' ORDER BY updated_at DESC`).all() as JobRow[];
    return rows.map(rowToRecord);
  }

  /** Requeue a dead-lettered job as a brand-new, immediately-claimable attempt cycle. */
  requeue(jobId: string): void {
    const now = this.now();
    this.db
      .prepare(
        `UPDATE jobs SET status = 'pending', attempts = 0, visible_at = @now, last_error = NULL, updated_at = @now WHERE id = @id AND status = 'dead'`,
      )
      .run({ id: jobId, now });
  }

  close(): void {
    this.db.close();
  }
}
