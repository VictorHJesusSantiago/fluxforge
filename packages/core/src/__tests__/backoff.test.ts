import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay } from '../backoff.js';

describe('calculateBackoffDelay', () => {
  it('fixed backoff returns the same delay regardless of attempt', () => {
    const policy = { maxAttempts: 5, backoff: 'fixed' as const, baseDelayMs: 200 };
    expect(calculateBackoffDelay(1, policy)).toBe(200);
    expect(calculateBackoffDelay(4, policy)).toBe(200);
  });

  it('exponential backoff doubles per attempt', () => {
    const policy = { maxAttempts: 5, backoff: 'exponential' as const, baseDelayMs: 100 };
    expect(calculateBackoffDelay(1, policy)).toBe(100);
    expect(calculateBackoffDelay(2, policy)).toBe(200);
    expect(calculateBackoffDelay(3, policy)).toBe(400);
    expect(calculateBackoffDelay(4, policy)).toBe(800);
  });

  it('caps at maxDelayMs', () => {
    const policy = {
      maxAttempts: 10,
      backoff: 'exponential' as const,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
    };
    expect(calculateBackoffDelay(10, policy)).toBe(5000);
  });

  it('jitter scales the capped delay by the injected random source, uniformly in [0, capped]', () => {
    const policy = {
      maxAttempts: 5,
      backoff: 'exponential' as const,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: true,
    };
    expect(calculateBackoffDelay(3, policy, () => 0)).toBe(0);
    expect(calculateBackoffDelay(3, policy, () => 1)).toBe(400);
    expect(calculateBackoffDelay(3, policy, () => 0.5)).toBe(200);
  });

  it('without jitter, the random source is never called', () => {
    const policy = { maxAttempts: 3, backoff: 'fixed' as const, baseDelayMs: 50 };
    let called = false;
    calculateBackoffDelay(1, policy, () => {
      called = true;
      return 0;
    });
    expect(called).toBe(false);
  });

  it('rejects attempt < 1', () => {
    const policy = { maxAttempts: 3, backoff: 'fixed' as const, baseDelayMs: 50 };
    expect(() => calculateBackoffDelay(0, policy)).toThrow(RangeError);
  });
});
