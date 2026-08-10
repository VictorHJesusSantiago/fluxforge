import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { ifNode, evaluateCondition } from '../runtime.js';

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
    expect(evaluateCondition({ msg: 42 }, { field: 'msg', operator: 'contains', value: 'world' })).toBe(false);
  });

  it('greaterThan / lessThan', () => {
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'greaterThan', value: 3 })).toBe(true);
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'greaterThan', value: 10 })).toBe(false);
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'lessThan', value: 10 })).toBe(true);
  });

  it('isEmpty / isNotEmpty treat undefined, null, and "" as empty', () => {
    expect(evaluateCondition({}, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: null }, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: '' }, { field: 'x', operator: 'isEmpty' })).toBe(true);
    expect(evaluateCondition({ x: 0 }, { field: 'x', operator: 'isEmpty' })).toBe(false);
    expect(evaluateCondition({ x: 'a' }, { field: 'x', operator: 'isNotEmpty' })).toBe(true);
  });

  it('a type mismatch (comparing a number field with contains) is false, not a throw', () => {
    expect(evaluateCondition({ n: 5 }, { field: 'n', operator: 'contains', value: 'x' })).toBe(false);
  });
});

describe('logic.if node', () => {
  it('splits items into true/false ports per-item', async () => {
    const output = await runNode(
      ifNode,
      { field: 'ok', operator: 'equals', value: true },
      { main: [{ ok: true, id: 1 }, { ok: false, id: 2 }, { ok: true, id: 3 }] },
    );
    expect(output.true).toEqual([{ ok: true, id: 1 }, { ok: true, id: 3 }]);
    expect(output.false).toEqual([{ ok: false, id: 2 }]);
  });

  it('an empty input produces empty output on both ports', async () => {
    const output = await runNode(ifNode, { field: 'x', operator: 'isEmpty' }, { main: [] });
    expect(output.true).toEqual([]);
    expect(output.false).toEqual([]);
  });

  it('rejects an invalid operator at the schema level', async () => {
    await expect(
      runNode(ifNode, { field: 'x', operator: 'wat' }, { main: [] }),
    ).rejects.toThrow();
  });
});
