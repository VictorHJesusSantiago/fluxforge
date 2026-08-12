import type { RunState, WorkflowDefinition } from '@fluxforge/core';

export interface WebhookMatch {
  workflowId: string;
  triggerNodeId: string;
}

interface WebhookTriggerParams {
  path: string;
  method?: string;
}

/**
 * Scans every stored workflow for a `trigger.webhook` node whose declared `path`+`method` match
 * an incoming request. Linear scan over every workflow's every node — fine at the scale a
 * self-hosted instance actually runs at; an index would be premature for a table that fits in
 * memory twice over before it matters.
 */
export function findWebhookTarget(
  workflows: WorkflowDefinition[],
  path: string,
  method: string,
): WebhookMatch | undefined {
  for (const workflow of workflows) {
    for (const node of workflow.nodes) {
      if (node.type !== 'trigger.webhook' || node.disabled) continue;
      const params = node.params as unknown as WebhookTriggerParams;
      const wantsMethod = (params.method ?? 'POST').toUpperCase();
      if (params.path === path && wantsMethod === method.toUpperCase()) {
        return { workflowId: workflow.id, triggerNodeId: node.id };
      }
    }
  }
  return undefined;
}

export interface WebhookResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Looks for a `utility.respond-to-webhook` node's recorded output in a finished run — identified
 * by *port name* (`response`), not by cross-referencing the workflow definition for which node
 * id has that type. That is a deliberate simplification: any node type that ever produces a
 * `response` port shaped `{ statusCode, body }` participates in this convention, which is a
 * looser coupling than requiring the caller to also have the `WorkflowDefinition` on hand.
 */
export function extractWebhookResponse(state: RunState): WebhookResponse | undefined {
  for (const nodeState of Object.values(state.nodes)) {
    const response = nodeState.output?.response?.[0];
    if (response !== undefined) return response as unknown as WebhookResponse;
  }
  return undefined;
}
