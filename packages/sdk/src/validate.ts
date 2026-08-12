import type { z } from 'zod';
import type { NodeDefinition } from './types.js';

export class NodeParamsValidationError extends Error {
  constructor(
    public readonly nodeType: string,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    const detail = issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    super(`node "${nodeType}" received invalid params:\n${detail}`);
    this.name = 'NodeParamsValidationError';
  }
}

/**
 * Parses raw, untyped params (JSON from a saved workflow, or from the editor's property form)
 * against a node's own schema. Called once per node execution by `toNodeRunner` — not once at
 * workflow-save time — because a param can legitimately be an expression resolved from a
 * previous node's output (SPEC "Expressions"), so the same node instance's *effective* params
 * can differ between runs even though its saved definition does not.
 */
export function validateParams<TParams>(def: NodeDefinition<TParams>, raw: unknown): TParams {
  const result = def.paramsSchema.safeParse(raw);
  if (!result.success) {
    throw new NodeParamsValidationError(def.type, result.error.issues);
  }
  return result.data;
}
