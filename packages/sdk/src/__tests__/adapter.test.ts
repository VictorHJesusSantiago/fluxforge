import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { NodeExecutionContext } from '@fluxforge/core';
import { defineNode } from '../define-node.js';
import { toNodeRunner } from '../adapter.js';
import { NodeParamsValidationError } from '../validate.js';

const upper = defineNode({
  type: 'test.upper',
  displayName: 'Uppercase',
  description: 'Uppercases each item\'s text field',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({ field: z.string() }),
  credentials: ['unused-example'],
  async run(ctx) {
    const field = ctx.params.field;
    const items = (ctx.input.main ?? []).map((item) => ({
      ...item,
      [field]: String(item[field]).toUpperCase(),
    }));
    return { main: items };
  },
});

function coreContext(overrides: Partial<NodeExecutionContext>): NodeExecutionContext {
  return {
    runId: 'r1',
    nodeId: 'n1',
    nodeType: 'test.upper',
    params: {},
    input: {},
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    ...overrides,
  };
}

describe('toNodeRunner', () => {
  it('produces a core-compatible NodeRunner that validates params and runs the node', async () => {
    const runner = toNodeRunner(upper);
    const output = await runner(
      coreContext({ params: { field: 'text' }, input: { main: [{ text: 'hi' }] } }),
    );
    expect(output.main).toEqual([{ text: 'HI' }]);
  });

  it('rejects invalid params before the node body ever runs', async () => {
    const runner = toNodeRunner(upper);
    await expect(runner(coreContext({ params: {} }))).rejects.toThrow(NodeParamsValidationError);
  });

  it('routes getCredential through the injected resolver', async () => {
    const withCred = defineNode({
      type: 'test.cred',
      displayName: 'Cred',
      description: 'Reads a credential',
      category: 'integration',
      inputs: [{ id: 'main', label: 'Input' }],
      outputs: [{ id: 'main', label: 'Output' }],
      paramsSchema: z.object({}),
      async run(ctx) {
        const cred = ctx.getCredential('slack');
        return { main: [{ token: cred?.token ?? null }] };
      },
    });
    const runner = toNodeRunner(withCred, {
      getCredential: (name) => (name === 'slack' ? { token: 'xoxb-secret' } : undefined),
    });
    const output = await runner(coreContext({ params: {} }));
    expect(output.main).toEqual([{ token: 'xoxb-secret' }]);
  });

  it('getCredential returns undefined when no resolver is given', async () => {
    const withCred = defineNode({
      type: 'test.cred2',
      displayName: 'Cred2',
      description: 'x',
      category: 'integration',
      inputs: [{ id: 'main', label: 'Input' }],
      outputs: [{ id: 'main', label: 'Output' }],
      paramsSchema: z.object({}),
      async run(ctx) {
        return { main: [{ cred: ctx.getCredential('anything') ?? null }] };
      },
    });
    const output = await toNodeRunner(withCred)(coreContext({ params: {} }));
    expect(output.main).toEqual([{ cred: null }]);
  });
});
