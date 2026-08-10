import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { noOpNode } from '../runtime.js';

describe('utility.no-op node', () => {
  it('passes an empty input through unchanged', async () => {
    const output = await runNode(noOpNode, {}, { main: [] });
    expect(output.main).toEqual([]);
  });

  it('passes a single item through unchanged', async () => {
    const output = await runNode(noOpNode, {}, { main: [{ id: 1, name: 'a' }] });
    expect(output.main).toEqual([{ id: 1, name: 'a' }]);
  });

  it('passes multiple items through unchanged, same order', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const output = await runNode(noOpNode, {}, { main: items });
    expect(output.main).toEqual(items);
  });

  it('missing main input defaults to an empty array', async () => {
    const output = await runNode(noOpNode, {}, {});
    expect(output.main).toEqual([]);
  });
});
