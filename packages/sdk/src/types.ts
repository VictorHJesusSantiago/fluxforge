import type { z } from 'zod';
import type { NodeLogger, PortItems } from '@fluxforge/core';

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'integration' | 'utility';

export interface NodePort {
  id: string;
  label: string;
  description?: string;
}

/**
 * The context a node's `run` function receives — the same shape as `@fluxforge/core`'s
 * `NodeExecutionContext`, except `params` is narrowed to the node's own declared type instead
 * of `Record<string, unknown>`. A third-party node author never imports `@fluxforge/core`
 * directly; this is the entire surface they need.
 */
export interface NodeContext<TParams> {
  runId: string;
  nodeId: string;
  input: PortItems;
  params: TParams;
  signal: AbortSignal;
  logger: NodeLogger;
  /** Looks up a named credential set (e.g. `"slack"` → `{ webhookUrl: "..." }`). */
  getCredential(name: string): Record<string, string> | undefined;
}

export interface NodeDefinitionInput<TParams> {
  /** A dotted registry key, e.g. `"http.request"`. Must be globally unique. */
  type: string;
  displayName: string;
  description: string;
  category: NodeCategory;
  /** A short identifier the editor maps to a glyph — no binary icon assets to ship or version. */
  icon?: string;
  /** Empty for a trigger (a node with nothing upstream of it, ever). */
  inputs: NodePort[];
  outputs: NodePort[];
  paramsSchema: z.ZodType<TParams>;
  /** Credential *names* this node needs looked up via `ctx.getCredential`. Documentation only —
   *  nothing enforces a node actually calls `getCredential` for everything it lists here, the
   *  same way a function's JSDoc `@throws` isn't enforced by the compiler. */
  credentials?: string[];
  run(ctx: NodeContext<TParams>): Promise<PortItems>;
}

/** What `defineNode` produces — validated once at definition time, then immutable. */
export interface NodeDefinition<TParams = unknown> extends NodeDefinitionInput<TParams> {
  readonly __brand: 'fluxforge.NodeDefinition';
}
