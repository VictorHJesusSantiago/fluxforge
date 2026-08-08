import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { aggregateNode } from '../runtime.js';
import { aggregateItems } from '../aggregate.js';

describe('aggregateItems', () => {
  it('empty input without groupBy still produces one item, all zeros', () => {
    const result = aggregateItems([], { field: 'n', operations: ['sum', 'count', 'avg', 'min', 'max'] });
    expect(result).toEqual([{ sum: 0, count: 0, avg: 0, min: 0, max: 0 }]);
  });

  it('empty input with groupBy produces zero items', () => {
    const result = aggregateItems([], { field: 'n', operations: ['sum'], groupBy: 'category' });
    expect(result).toEqual([]);
  });

  it('single group (no groupBy) computes only the requested operations', () => {
    const result = aggregateItems(
      [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
      { field: 'n', operations: ['sum', 'avg', 'count'] },
    );
    expect(result).toEqual([{ sum: 10, avg: 2.5, count: 4 }]);
    expect(result[0]).not.toHaveProperty('min');
    expect(result[0]).not.toHaveProperty('max');
  });

  it('multiple groups via groupBy, one item per distinct value, in first-seen order', () => {
    const result = aggregateItems(
      [
        { category: 'a', n: 10 },
        { category: 'b', n: 5 },
        { category: 'a', n: 20 },
        { category: 'b', n: 15 },
      ],
      { field: 'n', operations: ['sum', 'count'], groupBy: 'category' },
    );
    expect(result).toEqual([
      { category: 'a', sum: 30, count: 2 },
      { category: 'b', sum: 20, count: 2 },
    ]);
  });

  it('non-numeric values of the aggregated field are skipped for sum/avg/min/max but still counted', () => {
    const result = aggregateItems(
      [{ n: 10 }, { n: 'not a number' }, { n: null }, { n: 20 }],
      { field: 'n', operations: ['sum', 'avg', 'min', 'max', 'count'] },
    );
    expect(result).toEqual([{ sum: 30, avg: 15, min: 10, max: 20, count: 4 }]);
  });

  it('a group whose items all have a non-numeric field yields zeros but still counts', () => {
    const result = aggregateItems(
      [{ category: 'a', n: 'nope' }],
      { field: 'n', operations: ['sum', 'count', 'avg'], groupBy: 'category' },
    );
    expect(result).toEqual([{ category: 'a', sum: 0, count: 1, avg: 0 }]);
  });

  it('min and max', () => {
    const result = aggregateItems(
      [{ n: 5 }, { n: 1 }, { n: 9 }],
      { field: 'n', operations: ['min', 'max'] },
    );
    expect(result).toEqual([{ min: 1, max: 9 }]);
  });
});

describe('data.aggregate node', () => {
  it('aggregates via runNode end-to-end', async () => {
    const output = await runNode(
      aggregateNode,
      { field: 'amount', operations: ['sum', 'count'] },
      { main: [{ amount: 100 }, { amount: 200 }] },
    );
    expect(output.main).toEqual([{ sum: 300, count: 2 }]);
  });

  it('groups via runNode end-to-end', async () => {
    const output = await runNode(
      aggregateNode,
      { field: 'amount', operations: ['sum'], groupBy: 'region' },
      { main: [{ region: 'east', amount: 5 }, { region: 'west', amount: 7 }, { region: 'east', amount: 3 }] },
    );
    expect(output.main).toEqual([
      { region: 'east', sum: 8 },
      { region: 'west', sum: 7 },
    ]);
  });

  it('rejects an empty operations array at the schema level', async () => {
    await expect(runNode(aggregateNode, { field: 'n', operations: [] }, { main: [] })).rejects.toThrow();
  });
});
