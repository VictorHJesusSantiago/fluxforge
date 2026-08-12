import type { PortItems } from '@fluxforge/core';
import type { NodeContext, NodeDefinition } from './types.js';
import { validateParams } from './validate.js';

/**
 * Everything a node author's own test suite needs to build a `NodeContext` without pulling in
 * `@fluxforge/core`'s executor at all — a node's tests should exercise `def.run` directly, the
 * same way `@fluxforge/core`'s own tests never construct a `Game`.
 */
export function createTestContext<TParams>(
  overrides: Partial<Omit<NodeContext<TParams>, 'params'>> & { params: TParams },
): NodeContext<TParams> {
  return {
    runId: 'test-run',
    nodeId: 'test-node',
    input: {},
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    getCredential: () => undefined,
    ...overrides,
  };
}

/**
 * Runs a node exactly the way the real executor does: raw params go through the node's own
 * `paramsSchema` first (so a test using `runNode` catches a schema mismatch the same way
 * production would, instead of silently handing a malformed object straight to `run`).
 */
export async function runNode<TParams>(
  def: NodeDefinition<TParams>,
  rawParams: unknown,
  input: PortItems = {},
): Promise<PortItems> {
  const params = validateParams(def, rawParams);
  return def.run(createTestContext({ params, input }));
}
