/**
 * @fluxforge/sdk — the entire surface a third-party node package needs. Depends only on
 * `@fluxforge/core` (for `PortItems`/`NodeLogger` types) and `zod` (for params schemas) — never
 * on the queue, the registry, the server, or the editor, so installing this package to write one
 * integration never pulls in a database driver or a canvas renderer.
 */
export { defineNode, NodeDefinitionError } from './define-node.js';
export { validateParams, NodeParamsValidationError } from './validate.js';
export { toNodeRunner, type CredentialResolver } from './adapter.js';
export { createTestContext, runNode } from './test-utils.js';
export type {
  NodeCategory,
  NodePort,
  NodeContext,
  NodeDefinition,
  NodeDefinitionInput,
} from './types.js';
export type { WorkflowItem, PortItems } from '@fluxforge/core';

export { z } from 'zod';
