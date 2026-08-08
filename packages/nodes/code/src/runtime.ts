import type { WorkflowItem } from '@fluxforge/sdk';
import { defineNode } from '@fluxforge/sdk';
import { codeParamsSchema, type CodeParams } from './schema.js';

/**
 * Evaluates `params.expression` against one item, with `item` and `index` in scope, and returns
 * its value as the new item.
 *
 * **This runs arbitrary JavaScript with the full privileges of the server process** — same
 * filesystem access, same network access, same environment variables as the Node.js process
 * running the workflow engine. `new Function` is not a sandbox and no attempt is made to make it
 * one (no `vm` module isolation, no allowlist, no timeout). That is an acceptable, honest
 * trade-off for a *self-hosted* engine executing workflows that the operator themselves authored
 * — exactly the same posture n8n's own Code node takes. It becomes a serious problem the moment
 * this engine is used to run someone else's untrusted workflow definitions (e.g. a multi-tenant
 * SaaS); that use case needs a real sandbox (a separate worker process, `vm2`/`isolated-vm`, or
 * similar) and is explicitly out of scope here.
 */
export function evaluateExpression(item: WorkflowItem, index: number, expression: CodeParams['expression']): unknown {
  const fn = new Function('item', 'index', `return (${expression});`) as (item: WorkflowItem, index: number) => unknown;
  return fn(item, index);
}

export const codeNode = defineNode({
  type: 'data.code',
  displayName: 'Code',
  description:
    'Runs a JavaScript expression against each item (item, index in scope) and returns its value as the new item. ' +
    'Executes arbitrary code with the privileges of the server process — no sandboxing — appropriate only for ' +
    'self-authored workflows, not for running untrusted workflow definitions.',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: codeParamsSchema,
  async run(ctx) {
    const items = ctx.input.main ?? [];
    const results: WorkflowItem[] = [];
    let index = 0;
    for (const item of items) {
      const value = evaluateExpression(item, index, ctx.params.expression);
      results.push(value as WorkflowItem);
      index += 1;
    }
    return { main: results };
  },
});
