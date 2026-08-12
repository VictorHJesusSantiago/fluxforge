import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineNode } from '@fluxforge/sdk';
import { NodeRegistry, DuplicateNodeTypeError } from '../registry.js';

const echo = defineNode({
  type: 'test.echo',
  displayName: 'Echo',
  description: 'Returns its input unchanged',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({}),
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});

const readsCred = defineNode({
  type: 'test.reads-cred',
  displayName: 'ReadsCred',
  description: 'Reads a credential',
  category: 'integration',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({}),
  async run(ctx) {
    return { main: [{ token: ctx.getCredential('api')?.token ?? null }] };
  },
});

describe('NodeRegistry', () => {
  it('registers and retrieves a definition by type', () => {
    const registry = new NodeRegistry();
    registry.register(echo);
    expect(registry.get('test.echo')).toBe(echo);
    expect(registry.has('test.echo')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('rejects registering the same type twice', () => {
    const registry = new NodeRegistry();
    registry.register(echo);
    expect(() => registry.register(echo)).toThrow(DuplicateNodeTypeError);
  });

  it('registerAll registers a batch', () => {
    const registry = new NodeRegistry();
    registry.registerAll([echo, readsCred]);
    expect(registry.list().map((d) => d.type).sort()).toEqual(['test.echo', 'test.reads-cred']);
  });

  it('createResolver produces a working core NodeRunnerResolver', async () => {
    const registry = new NodeRegistry();
    registry.register(echo);
    const resolver = registry.createResolver();
    const runner = resolver.resolve('test.echo');
    expect(runner).toBeDefined();

    const output = await runner!({
      runId: 'r',
      nodeId: 'n',
      nodeType: 'test.echo',
      params: {},
      input: { main: [{ x: 1 }] },
      signal: new AbortController().signal,
      logger: { info() {}, warn() {}, error() {} },
    });
    expect(output.main).toEqual([{ x: 1 }]);
  });

  it('resolve() returns undefined for an unregistered type', () => {
    const registry = new NodeRegistry();
    const resolver = registry.createResolver();
    expect(resolver.resolve('nope')).toBeUndefined();
  });

  it('binds credentials per-resolver, not globally on the registry', async () => {
    const registry = new NodeRegistry();
    registry.register(readsCred);

    const withCreds = registry.createResolver({
      getCredential: (name) => (name === 'api' ? { token: 'secret' } : undefined),
    });
    const withoutCreds = registry.createResolver();

    const ctx = {
      runId: 'r',
      nodeId: 'n',
      nodeType: 'test.reads-cred',
      params: {},
      input: {},
      signal: new AbortController().signal,
      logger: { info() {}, warn() {}, error() {} },
    };

    expect((await withCreds.resolve('test.reads-cred')!(ctx)).main).toEqual([{ token: 'secret' }]);
    expect((await withoutCreds.resolve('test.reads-cred')!(ctx)).main).toEqual([{ token: null }]);
  });
});
