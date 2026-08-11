import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { setNode, applySet } from '../runtime.js';

describe('applySet', () => {
  it('adds a new field', () => {
    expect(applySet({ id: 1 }, { set: { name: 'a' }, remove: [] })).toEqual({ id: 1, name: 'a' });
  });

  it('overwrites an existing field', () => {
    expect(applySet({ id: 1, name: 'old' }, { set: { name: 'new' }, remove: [] })).toEqual({
      id: 1,
      name: 'new',
    });
  });

  it('removes a field', () => {
    expect(applySet({ id: 1, temp: 'x' }, { set: {}, remove: ['temp'] })).toEqual({ id: 1 });
  });

  it('removes and sets in the same call — set wins for a field named in both', () => {
    expect(applySet({ id: 1, status: 'old' }, { set: { status: 'done' }, remove: ['status'] })).toEqual({
      id: 1,
      status: 'done',
    });
  });

  it('removing a field the item does not have does not throw', () => {
    expect(applySet({ id: 1 }, { set: {}, remove: ['missing'] })).toEqual({ id: 1 });
  });

  it('does not mutate the original item', () => {
    const original = { id: 1, name: 'a' };
    applySet(original, { set: { name: 'b' }, remove: [] });
    expect(original).toEqual({ id: 1, name: 'a' });
  });
});

describe('data.set node', () => {
  it('applies set/remove across every input item', async () => {
    const output = await runNode(
      setNode,
      { set: { active: true }, remove: ['secret'] },
      { main: [{ id: 1, secret: 'a' }, { id: 2, secret: 'b' }] },
    );
    expect(output.main).toEqual([
      { id: 1, active: true },
      { id: 2, active: true },
    ]);
  });

  it('an empty input produces empty output', async () => {
    const output = await runNode(setNode, { set: { x: 1 }, remove: [] }, { main: [] });
    expect(output.main).toEqual([]);
  });

  it('defaults set and remove to empty when omitted', async () => {
    const output = await runNode(setNode, {}, { main: [{ id: 1 }] });
    expect(output.main).toEqual([{ id: 1 }]);
  });
});
