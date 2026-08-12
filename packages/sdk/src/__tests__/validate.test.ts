import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineNode } from '../define-node.js';
import { validateParams, NodeParamsValidationError } from '../validate.js';

const def = defineNode({
  type: 'test.greet',
  displayName: 'Greet',
  description: 'Greets someone',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({ name: z.string().min(1), times: z.number().int().positive().default(1) }),
  async run(ctx) {
    return { main: Array(ctx.params.times).fill({ greeting: `hi ${ctx.params.name}` }) };
  },
});

describe('validateParams', () => {
  it('parses and applies defaults for valid input', () => {
    const params = validateParams(def, { name: 'Ada' });
    expect(params).toEqual({ name: 'Ada', times: 1 });
  });

  it('throws NodeParamsValidationError with a readable message for invalid input', () => {
    expect(() => validateParams(def, { name: '' })).toThrow(NodeParamsValidationError);
    try {
      validateParams(def, { name: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NodeParamsValidationError);
      const e = error as NodeParamsValidationError;
      expect(e.nodeType).toBe('test.greet');
      expect(e.issues.length).toBeGreaterThan(0);
      expect(e.message).toContain('name');
    }
  });

  it('rejects missing required fields', () => {
    expect(() => validateParams(def, {})).toThrow(NodeParamsValidationError);
  });

  it('rejects the wrong type entirely', () => {
    expect(() => validateParams(def, 'not an object')).toThrow(NodeParamsValidationError);
  });
});
