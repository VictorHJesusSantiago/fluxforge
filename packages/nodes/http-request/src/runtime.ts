import { defineNode, type WorkflowItem } from '@fluxforge/sdk';
import { httpRequestParamsSchema } from './schema.js';
import { buildRequest, parseResponse } from './request.js';

/**
 * Aborts when either `parent` aborts or `timeoutMs` elapses, whichever first — hand-rolled
 * instead of `AbortSignal.any` for portability to any Node 20.x patch, not just 20.3+.
 */
function withTimeout(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', onParentAbort);

  const timer = setTimeout(() => controller.abort(new Error(`HTTP request timed out after ${timeoutMs}ms`)), timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onParentAbort);
    },
  };
}

export const httpRequestNode = defineNode({
  type: 'action.http-request',
  displayName: 'HTTP Request',
  description: 'Makes an HTTP request per input item (or once, with no input) and returns the response.',
  category: 'action',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: httpRequestParamsSchema,
  credentials: ['http-bearer'],
  async run(ctx) {
    const items: WorkflowItem[] = ctx.input.main !== undefined && ctx.input.main.length > 0 ? ctx.input.main : [{}];
    const bearerToken = ctx.params.credential === undefined ? undefined : ctx.getCredential(ctx.params.credential)?.token;

    const results: WorkflowItem[] = [];
    for (const _item of items) {
      const { url, init } = buildRequest(ctx.params, bearerToken);
      const { signal, cancel } = withTimeout(ctx.signal, ctx.params.timeoutMs);

      try {
        const response = await fetch(url, { ...init, signal });
        const parsed = await parseResponse(response);

        if (!parsed.ok && !ctx.params.ignoreHttpErrors) {
          throw new Error(`HTTP ${parsed.status} from ${url}`);
        }
        results.push({ status: parsed.status, ok: parsed.ok, headers: parsed.headers, body: parsed.body });
      } finally {
        cancel();
      }
    }

    return { main: results };
  },
});
