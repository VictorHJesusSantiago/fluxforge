import type { NodeDefinition, NodeDefinitionInput, NodePort } from './types.js';

export class NodeDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeDefinitionError';
  }
}

const TYPE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

function assertUniquePortIds(ports: NodePort[], portKind: 'inputs' | 'outputs', nodeType: string): void {
  const seen = new Set<string>();
  for (const port of ports) {
    if (seen.has(port.id)) {
      throw new NodeDefinitionError(`node "${nodeType}": duplicate ${portKind} port id "${port.id}"`);
    }
    seen.add(port.id);
  }
}

/**
 * The one function a third-party node package calls. Validates the *definition's own shape*
 * (a malformed node package should fail loudly at import time, in the author's own test suite —
 * not three layers deep in a running workflow); it does not touch `paramsSchema` beyond checking
 * it's present, since validating actual param values only makes sense once real params exist
 * (see `validateParams` for that, called per-execution by `toNodeRunner`).
 */
export function defineNode<TParams>(input: NodeDefinitionInput<TParams>): NodeDefinition<TParams> {
  if (!TYPE_PATTERN.test(input.type)) {
    throw new NodeDefinitionError(
      `node type "${input.type}" must be dot-separated lowercase segments, e.g. "http.request"`,
    );
  }
  if (input.displayName.trim() === '') {
    throw new NodeDefinitionError(`node "${input.type}": displayName must not be empty`);
  }
  if (input.description.trim() === '') {
    throw new NodeDefinitionError(`node "${input.type}": description must not be empty`);
  }
  assertUniquePortIds(input.inputs, 'inputs', input.type);
  assertUniquePortIds(input.outputs, 'outputs', input.type);
  // Zero outputs is legitimate — a terminal "sink" node (log, respond-to-webhook) has nothing
  // downstream to feed. Zero *inputs* is likewise legitimate: that is exactly what a trigger is.

  return Object.freeze({ ...input, __brand: 'fluxforge.NodeDefinition' as const });
}
