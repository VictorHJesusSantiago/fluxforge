import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { filterNode, evaluateCondition } from '../runtime.js';

describe('evaluateCondition', () => {
  it('equals', () => {
    expect(evaluateCondition({ status: 'ok' }, { field: 'status', operator: 'equals', value: 'ok' })).toBe(true);
    expect(evaluateCondition({ status: 'fail' }, { field: 'status', operator: 'equals', value: 'ok' })).toBe(false);
  });

  it('notEquals', () => {
    expect(evaluateCondition({ status: 'fail' }, { field: 'status', operator: 'notEquals', value: 'ok' })).toBe(true);
  });

  it('contains', () => {
    expect(evaluateCondition({ msg: 'hello world' }, { field: 'msg', operator: 'contains', value: 'world' })).toBe(true);
    expect(evaluateCondition({ msg: 'hello' }, { field: 'msg', operator: 'contains', value: 'world' })).toBe(false);
  });

  it('greaterThan / lessThan', () => {
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'greaterThan', value: 3 })).toBe(true);
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'lessThan', value: 10 })).toBe(true);
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'lessThan', value: 3 })).toBe(false);
  });

  it('isEmpty / isNotEmpty treat undefined, null, and "" as empty', () => {
    expect(evaluateCondition({}, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: null }, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: '' }, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: 0 }, { field: 'x', operator: 'isEmpty' })).toBe(false);
    expect(evaluateCondition({ x: 'a' }, { field: 'x', operator: 'isNotEmpty' })).toBe(true);
  });

  it('a type mismatch is false, not a throw', () => {
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'contains', value: 'x' })).toBe(false);
  });
});

describe('logic.filter node', () => {
  it('keeps only matching items, dropping the rest, on a single main port', async () => {
    const output = await runNode(
      filterNode,
      { field: 'status', operator: 'equals', value: 'active' },
      { main: [{ status: 'active', id: 1 }, { status: 'inactive', id: 2 }, { status: 'active', id: 3 }] },
    );
    expect(output.main).toEqual([{ status: 'active', id: 1 }, { status: 'active', id: 3 }]);
    expect(Object.keys(output)).toEqual(['main']);
  });

  it('an all-non-matching input legitimately produces zero output items', async () => {
    const output = await runNode(
      filterNode,
      { field: 'status', operator: 'equals', value: 'active' },
      { main: [{ status: 'inactive' }, { status: 'closed' }] },
    );
    expect(output.main).toEqual([]);
  });

  it('an empty input produces empty output', async () => {
    const output = await runNode(filterNode, { field: 'x', operator: 'isEmpty' }, { main: [] });
    expect(output.main).toEqual([]);
  });

  it('rejects an invalid operator at the schema level', async () => {
    await expect(runNode(filterNode, { field: 'x', operator: 'wat' }, { main: [] })).rejects.toThrow();
  });
});
