import { defineNode, type WorkflowItem } from '@fluxforge/sdk';
import { githubIssueParamsSchema } from './schema.js';
import { buildRequest } from './request.js';

export const githubIssueNode = defineNode({
  type: 'integration.github-issue',
  displayName: 'GitHub Issue',
  description: 'Creates a GitHub issue via the REST API, once per input item (or once if there is no input).',
  category: 'integration',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: githubIssueParamsSchema,
  credentials: ['github'],
  async run(ctx) {
    const token = ctx.getCredential('github')?.token;
    if (token === undefined) {
      throw new Error('integration.github-issue requires a "github" credential with a "token" field');
    }

    const items: WorkflowItem[] = ctx.input.main !== undefined && ctx.input.main.length > 0 ? ctx.input.main : [{}];

    const results: WorkflowItem[] = [];
    for (const _item of items) {
      const { url, init } = buildRequest(ctx.params, token);
      const response = await fetch(url, init);
      const bodyText = await response.text();
      const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;

      if (!response.ok) {
        throw new Error(`GitHub issue creation failed with HTTP ${response.status}: ${bodyText}`);
      }

      results.push({ status: response.status, ok: response.ok, body });
    }

    return { main: results };
  },
});
