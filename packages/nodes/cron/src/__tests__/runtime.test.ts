import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { cronNode } from '../runtime.js';

describe('trigger.cron node', () => {
  it('emits a single item recording when it fired', async () => {
    const before = Date.now();
    const output = await runNode(cronNode, { expression: '0 9 * * *' }, {});
    const after = Date.now();

    expect(output.main).toHaveLength(1);
    const firedAt = output.main![0].firedAt as string;
    expect(typeof firedAt).toBe('string');
    const firedAtMs = new Date(firedAt).getTime();
    expect(firedAtMs).toBeGreaterThanOrEqual(before);
    expect(firedAtMs).toBeLessThanOrEqual(after);
  });

  it('defaults timezone to UTC', async () => {
    const output = await runNode(cronNode, { expression: '* * * * *' }, {});
    expect(output.main).toHaveLength(1);
  });

  it('rejects a malformed cron expression at the schema level', async () => {
    await expect(runNode(cronNode, { expression: 'not a cron' }, {})).rejects.toThrow();
    await expect(runNode(cronNode, { expression: '60 * * * *' }, {})).rejects.toThrow();
  });

  it('rejects a missing expression', async () => {
    await expect(runNode(cronNode, {}, {})).rejects.toThrow();
  });

  it('declares zero inputs, since it is a root/trigger node', () => {
    expect(cronNode.inputs).toEqual([]);
  });
});
