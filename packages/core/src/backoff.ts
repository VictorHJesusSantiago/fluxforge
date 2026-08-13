import type { RetryPolicy } from './types.js';

/**
 * The delay before retry attempt `attempt` (1-indexed: the delay before the *second* attempt is
 * `calculateBackoffDelay(1, policy)`). Pure and deterministic when `random` is supplied — the
 * executor injects `Math.random` in production and a fixed sequence in tests, which is what
 * makes retry-timing tests exact instead of "eventually, probably."
 *
 * Exponential backoff without a cap grows unboundedly, so `maxDelayMs` is applied before jitter,
 * not after — jittering an already-capped delay is what actually spreads out a thundering herd;
 * jittering an uncapped one just produces a huge number most of the time.
 */
export function calculateBackoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  if (attempt < 1) {
    throw new RangeError(`calculateBackoffDelay: attempt must be >= 1, got ${attempt}`);
  }

  const raw =
    policy.backoff === 'fixed' ? policy.baseDelayMs : policy.baseDelayMs * 2 ** (attempt - 1);
  const capped = policy.maxDelayMs === undefined ? raw : Math.min(raw, policy.maxDelayMs);

  if (!policy.jitter) return capped;
  return random() * capped;
}
