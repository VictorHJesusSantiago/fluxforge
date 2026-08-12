import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineNode, NodeDefinitionError } from '../define-node.js';

function baseDef(overrides: Partial<Parameters<typeof defineNode>[0]> = {}) {
  return {
    type: 'test.noop',
    displayName: 'Test',
    description: 'A test node',
    category: 'utility' as const,
    inputs: [{ id: 'main', label: 'Input' }],
    outputs: [{ id: 'main', label: 'Output' }],
    paramsSchema: z.object({}),
    async run() {
      return { main: [] };
    },
    ...overrides,
  };
}

describe('defineNode', () => {
  it('accepts a well-formed definition and freezes it', () => {
    const def = defineNode(baseDef());
    expect(def.type).toBe('test.noop');
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('rejects a type that is not dot-separated lowercase', () => {
    expect(() => defineNode(baseDef({ type: 'Http.Request' }))).toThrow(NodeDefinitionError);
    expect(() => defineNode(baseDef({ type: 'http request' }))).toThrow(NodeDefinitionError);
    expect(() => defineNode(baseDef({ type: '.http' }))).toThrow(NodeDefinitionError);
  });

  it('accepts a multi-segment dotted type', () => {
    expect(() => defineNode(baseDef({ type: 'integration.slack.webhook' }))).not.toThrow();
  });

  it('accepts hyphenated segments', () => {
    expect(() => defineNode(baseDef({ type: 'test.reads-cred' }))).not.toThrow();
  });

  it('rejects an empty displayName or description', () => {
    expect(() => defineNode(baseDef({ displayName: '' }))).toThrow(/displayName/);
    expect(() => defineNode(baseDef({ description: '  ' }))).toThrow(/description/);
  });

  it('rejects duplicate input port ids', () => {
    expect(() =>
      defineNode(
        baseDef({
          inputs: [{ id: 'main', label: 'A' }, { id: 'main', label: 'B' }],
        }),
      ),
    ).toThrow(/duplicate inputs port id/);
  });

  it('rejects duplicate output port ids', () => {
    expect(() =>
      defineNode(
        baseDef({
          outputs: [{ id: 'true', label: 'A' }, { id: 'true', label: 'B' }],
        }),
      ),
    ).toThrow(/duplicate outputs port id/);
  });

  it('allows zero inputs (a trigger) and zero outputs (a sink)', () => {
    expect(() => defineNode(baseDef({ inputs: [] }))).not.toThrow();
    expect(() => defineNode(baseDef({ outputs: [] }))).not.toThrow();
  });
});
