import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { webhookNode } from '../runtime.js';

describe('trigger.webhook params', () => {
  it('defaults method to POST', async () => {
    const output = await runNode(webhookNode, { path: '/hooks/orders' }, { main: [{ x: 1 }] });
    expect(output.main).toEqual([{ x: 1 }]);
  });

  it('accepts each declared method', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      await expect(runNode(webhookNode, { path: '/h', method }, { main: [] })).resolves.toEqual({ main: [] });
    }
  });

  it('rejects an empty path', async () => {
    await expect(runNode(webhookNode, { path: '' }, { main: [] })).rejects.toThrow();
  });

  it('rejects a missing path', async () => {
    await expect(runNode(webhookNode, {}, { main: [] })).rejects.toThrow();
  });

  it('rejects an unsupported method', async () => {
    await expect(runNode(webhookNode, { path: '/h', method: 'TRACE' }, { main: [] })).rejects.toThrow();
  });
});

describe('trigger.webhook node behavior', () => {
  it('passes through whatever the server seeded on main (parsed request body/query)', async () => {
    const output = await runNode(
      webhookNode,
      { path: '/hooks/orders', method: 'POST' },
      { main: [{ orderId: 42, source: 'shopify' }] },
    );
    expect(output.main).toEqual([{ orderId: 42, source: 'shopify' }]);
  });

  it('produces an empty main output when seeded with nothing', async () => {
    const output = await runNode(webhookNode, { path: '/hooks/orders' }, {});
    expect(output.main).toEqual([]);
  });

  it('declares zero inputs, since it is a root/trigger node', () => {
    expect(webhookNode.inputs).toEqual([]);
  });
});
