import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { manualNode } from '../runtime.js';

describe('trigger.manual node', () => {
  it('passes through whatever items were seeded on main', async () => {
    const output = await runNode(manualNode, {}, { main: [{ a: 1 }, { b: 2 }] });
    expect(output.main).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('produces an empty main output when seeded with nothing', async () => {
    const output = await runNode(manualNode, {}, {});
    expect(output.main).toEqual([]);
  });

  it('declares zero inputs, since it is a root/trigger node', () => {
    expect(manualNode.inputs).toEqual([]);
  });

  it('rejects unknown params (schema takes no fields)', async () => {
    const output = await runNode(manualNode, { unexpected: true }, { main: [{ x: 1 }] });
    expect(output.main).toEqual([{ x: 1 }]);
  });
});
