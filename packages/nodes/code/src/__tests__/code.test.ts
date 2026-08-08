import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { codeNode, evaluateExpression } from '../runtime.js';

describe('evaluateExpression', () => {
  it('passthrough expression returns the item unchanged', () => {
    expect(evaluateExpression({ id: 1, name: 'a' }, 0, 'item')).toEqual({ id: 1, name: 'a' });
  });

  it('transforming expression', () => {
    expect(evaluateExpression({ name: 'ada' }, 0, '({ ...item, upper: item.name.toUpperCase() })')).toEqual({
      name: 'ada',
      upper: 'ADA',
    });
  });

  it('uses index', () => {
    expect(evaluateExpression({ x: 1 }, 3, '({ ...item, position: index })')).toEqual({ x: 1, position: 3 });
  });

  it('a throwing expression propagates the error, not swallowed', () => {
    expect(() => evaluateExpression({}, 0, 'item.missing.deeper')).toThrow();
  });
});

describe('data.code node', () => {
  it('applies the expression across every item, with the correct index each time', async () => {
    const output = await runNode(
      codeNode,
      { expression: '({ ...item, doubled: item.n * 2, i: index })' },
      { main: [{ n: 1 }, { n: 2 }, { n: 3 }] },
    );
    expect(output.main).toEqual([
      { n: 1, doubled: 2, i: 0 },
      { n: 2, doubled: 4, i: 1 },
      { n: 3, doubled: 6, i: 2 },
    ]);
  });

  it('an empty input produces empty output', async () => {
    const output = await runNode(codeNode, { expression: 'item' }, { main: [] });
    expect(output.main).toEqual([]);
  });

  it('a throwing expression rejects the run, not resolves with a partial result', async () => {
    await expect(
      runNode(codeNode, { expression: 'item.missing.deeper' }, { main: [{ id: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects an empty expression string at the schema level', async () => {
    await expect(runNode(codeNode, { expression: '' }, { main: [] })).rejects.toThrow();
  });
});
