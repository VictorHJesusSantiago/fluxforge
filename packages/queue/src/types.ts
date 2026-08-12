import type { BackoffKind } from '@fluxforge/core';

export type JobStatus = 'pending' | 'done' | 'dead';

export interface EnqueueOptions {
  /** Delay before the job becomes claimable at all. Defaults to 0 (claimable immediately). */
  delayMs?: number;
  /** Total delivery attempts allowed, including the first. Defaults to 1 (no redelivery). */
  maxAttempts?: number;
  backoff?: BackoffKind;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface JobRecord {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  visibleAt: number;
  createdAt: number;
  updatedAt: number;
  lastError: string | undefined;
}

/** What `claim()` hands a worker — the payload, plus enough to `complete`/`fail` it back. */
export interface ClaimedJob<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  attempts: number;
}
