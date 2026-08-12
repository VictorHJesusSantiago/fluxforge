import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { switchNode, routeItem } from '../runtime.js';

const CASES = [
  { value: 'us', output: 'case-0' },
  { value: 'ca', output: 'case-1' },
  { value: 'mx', output: 'case-2' },
];

describe('routeItem', () => {
  it('routes to the matching case output', () => {
    expect(routeItem({ country: 'us' }, { field: 'country', cases: CASES })).toBe('case-0');
    expect(routeItem({ country: 'ca' }, { field: 'country', cases: CASES })).toBe('case-1');
  });

  it('falls back to default when nothing matches', () => {
    expect(routeItem({ country: 'de' }, { field: 'country', cases: CASES })).toBe('default');
  });

  it('falls back to default when the field is missing entirely', () => {
    expect(routeItem({}, { field: 'country', cases: CASES })).toBe('default');
  });

  it('the first matching case wins when cases overlap', () => {
    const overlapping = [
      { value: 'us', output: 'case-0' },
      { value: 'us', output: 'case-1' },
    ];
    expect(routeItem({ country: 'us' }, { field: 'country', cases: overlapping })).toBe('case-0');
  });

  it('compares by strict equality, so a number field does not match a string case', () => {
    expect(routeItem({ code: 1 }, { field: 'code', cases: [{ value: '1', output: 'case-0' }] })).toBe('default');
  });
});

describe('logic.switch node', () => {
  it('routes each item individually across case ports, and unmatched items to default', async () => {
    const output = await runNode(
      switchNode,
      { field: 'country', cases: CASES },
      { main: [{ country: 'us', id: 1 }, { country: 'de', id: 2 }, { country: 'ca', id: 3 }] },
    );
    expect(output['case-0']).toEqual([{ country: 'us', id: 1 }]);
    expect(output['case-1']).toEqual([{ country: 'ca', id: 3 }]);
    expect(output['case-2']).toEqual([]);
    expect(output.default).toEqual([{ country: 'de', id: 2 }]);
  });

  it('declares fixed ports case-0..case-4 plus default', () => {
    const ids = switchNode.outputs.map((p) => p.id);
    expect(ids).toEqual(['case-0', 'case-1', 'case-2', 'case-3', 'case-4', 'default']);
  });

  it('an empty input produces empty output on every port', async () => {
    const output = await runNode(switchNode, { field: 'x', cases: [] }, { main: [] });
    for (const port of switchNode.outputs) {
      expect(output[port.id]).toEqual([]);
    }
  });

  it('rejects more than 5 cases at the schema level', async () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => ({ value: `v${i}`, output: 'case-0' }));
    await expect(runNode(switchNode, { field: 'x', cases: tooMany }, { main: [] })).rejects.toThrow();
  });

  it('rejects a case output that is not one of the fixed port ids', async () => {
    await expect(
      runNode(switchNode, { field: 'x', cases: [{ value: 'a', output: 'not-a-port' }] }, { main: [] }),
    ).rejects.toThrow();
  });
});
