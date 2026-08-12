import { describe, it, expect } from 'vitest';
import type { RunState, WorkflowDefinition } from '@fluxforge/core';
import { findWebhookTarget, extractWebhookResponse } from '../webhook-router.js';

function webhookWorkflow(id: string, path: string, method = 'POST'): WorkflowDefinition {
  return {
    id,
    name: id,
    nodes: [{ id: 'trig', type: 'trigger.webhook', params: { path, method } }],
    edges: [],
  };
}

describe('findWebhookTarget', () => {
  it('matches a workflow by path and method', () => {
    const workflows = [webhookWorkflow('a', '/hooks/a'), webhookWorkflow('b', '/hooks/b')];
    expect(findWebhookTarget(workflows, '/hooks/b', 'POST')).toEqual({ workflowId: 'b', triggerNodeId: 'trig' });
  });

  it('returns undefined when no workflow matches', () => {
    const workflows = [webhookWorkflow('a', '/hooks/a')];
    expect(findWebhookTarget(workflows, '/hooks/nope', 'POST')).toBeUndefined();
  });

  it('is case-insensitive on method and defaults to POST when unspecified', () => {
    const workflows: WorkflowDefinition[] = [
      { id: 'a', name: 'a', nodes: [{ id: 't', type: 'trigger.webhook', params: { path: '/x' } }], edges: [] },
    ];
    expect(findWebhookTarget(workflows, '/x', 'post')).toEqual({ workflowId: 'a', triggerNodeId: 't' });
  });

  it('ignores disabled webhook trigger nodes', () => {
    const workflows: WorkflowDefinition[] = [
      {
        id: 'a',
        name: 'a',
        nodes: [{ id: 't', type: 'trigger.webhook', params: { path: '/x' }, disabled: true }],
        edges: [],
      },
    ];
    expect(findWebhookTarget(workflows, '/x', 'POST')).toBeUndefined();
  });

  it('does not match a differing method', () => {
    const workflows = [webhookWorkflow('a', '/hooks/a', 'GET')];
    expect(findWebhookTarget(workflows, '/hooks/a', 'POST')).toBeUndefined();
  });
});

describe('extractWebhookResponse', () => {
  function state(nodes: RunState['nodes']): RunState {
    return { runId: 'r', workflowId: 'w', status: 'succeeded', nodes, startedAt: new Date().toISOString() };
  }

  it('finds the response port on whichever node produced one', () => {
    const s = state({
      other: { status: 'succeeded', attempts: 1, output: { main: [{ x: 1 }] } },
      responder: { status: 'succeeded', attempts: 1, output: { response: [{ statusCode: 201, body: { ok: true } }] } },
    });
    expect(extractWebhookResponse(s)).toEqual({ statusCode: 201, body: { ok: true } });
  });

  it('returns undefined when no node produced a response port', () => {
    const s = state({ a: { status: 'succeeded', attempts: 1, output: { main: [] } } });
    expect(extractWebhookResponse(s)).toBeUndefined();
  });

  it('returns undefined for a run with no nodes at all', () => {
    expect(extractWebhookResponse(state({}))).toBeUndefined();
  });
});
