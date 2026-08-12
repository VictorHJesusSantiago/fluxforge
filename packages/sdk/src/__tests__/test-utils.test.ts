import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineNode } from '../define-node.js';
import { createTestContext, runNode } from '../test-utils.js';
import { NodeParamsValidationError } from '../validate.js';

const double = defineNode({
  type: 'test.double',
  displayName: 'Double',
  description: 'Doubles a number field',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({ field: z.string().default('n') }),
  async run(ctx) {
    const field = ctx.params.field;
    return { main: (ctx.input.main ?? []).map((item) => ({ ...item, [field]: (item[field] as number) * 2 })) };
  },
});

describe('createTestContext', () => {
  it('fills in sensible defaults so a node author only supplies params and input', () => {
    const ctx = createTestContext({ params: { field: 'n' }, input: { main: [{ n: 3 }] } });
    expect(ctx.runId).toBeTruthy();
    expect(ctx.signal.aborted).toBe(false);
    expect(ctx.getCredential('anything')).toBeUndefined();
  });
});

describe('runNode', () => {
  it('validates params through the schema and runs the node', async () => {
    const output = await runNode(double, { field: 'n' }, { main: [{ n: 5 }] });
    expect(output.main).toEqual([{ n: 10 }]);
  });

  it('applies schema defaults the same way production execution does', async () => {
    const output = await runNode(double, {}, { main: [{ n: 7 }] });
    expect(output.main).toEqual([{ n: 14 }]);
  });

  it('surfaces a validation error for bad params, catching author mistakes in their own tests', async () => {
    await expect(runNode(double, { field: 123 }, {})).rejects.toThrow(NodeParamsValidationError);
  });
});
