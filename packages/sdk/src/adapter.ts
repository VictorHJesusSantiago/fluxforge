import type { NodeExecutionContext, NodeRunner } from '@fluxforge/core';
import type { NodeDefinition } from './types.js';
import { validateParams } from './validate.js';

export interface CredentialResolver {
  getCredential(name: string): Record<string, string> | undefined;
}

const NO_CREDENTIALS: CredentialResolver = { getCredential: () => undefined };

/**
 * Bridges a `NodeDefinition` (the SDK's typed, schema-validated authoring shape) into
 * `@fluxforge/core`'s plain `NodeRunner` (an untyped `(ctx) => Promise<PortItems>` function) —
 * this is the only place those two shapes meet. `@fluxforge/registry` calls this once per
 * definition when building its resolver; core itself never imports the SDK at all (dependency
 * direction: `core` ← `sdk` ← `registry`), which is what keeps a third-party node package's only
 * required dependency at `@fluxforge/sdk`, not the whole engine.
 */
export function toNodeRunner<TParams>(
  def: NodeDefinition<TParams>,
  credentials: CredentialResolver = NO_CREDENTIALS,
): NodeRunner {
  return async (ctx: NodeExecutionContext) => {
    const params = validateParams(def, ctx.params);
    return def.run({
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      input: ctx.input,
      params,
      signal: ctx.signal,
      logger: ctx.logger,
      getCredential: (name) => credentials.getCredential(name),
    });
  };
}
