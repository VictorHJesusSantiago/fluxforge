import type { RunState, WorkflowDefinition } from '@fluxforge/core';
import type { NodePort, NodeCategory } from '@fluxforge/sdk';
import { parseSseChunk } from './sse-parser.js';
import type { RunEvent } from '@fluxforge/core';
import type { JsonSchemaObject } from './json-schema-form.js';

export interface NodeTypeInfo {
  type: string;
  displayName: string;
  description: string;
  category: NodeCategory;
  icon: string | undefined;
  inputs: NodePort[];
  outputs: NodePort[];
  paramsSchema: JsonSchemaObject;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeadLetterJob {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | undefined;
  updatedAt: number;
}

/** Thin `fetch` wrappers — the editor's only coupling to `@fluxforge/server`'s HTTP contract. */
export class ApiClient {
  constructor(private readonly baseUrl: string = '') {}

  async listNodeTypes(): Promise<NodeTypeInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/nodes`);
    return res.json() as Promise<NodeTypeInfo[]>;
  }

  async listWorkflows(): Promise<WorkflowSummary[]> {
    const res = await fetch(`${this.baseUrl}/api/workflows`);
    return res.json() as Promise<WorkflowSummary[]>;
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition> {
    const res = await fetch(`${this.baseUrl}/api/workflows/${id}`);
    if (!res.ok) throw new Error(`getWorkflow(${id}): ${res.status}`);
    return res.json() as Promise<WorkflowDefinition>;
  }

  async createWorkflow(name: string, definition: WorkflowDefinition): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, definition }),
    });
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  async saveWorkflow(id: string, name: string, definition: WorkflowDefinition): Promise<void> {
    await fetch(`${this.baseUrl}/api/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, definition }),
    });
  }

  async listRuns(workflowId: string): Promise<RunState[]> {
    const res = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/runs`);
    return res.json() as Promise<RunState[]>;
  }

  /**
   * Runs a workflow and streams live `RunEvent`s as they arrive — the response *is* the SSE
   * stream (see `http.ts`'s streaming endpoint), so this reads the body incrementally rather
   * than waiting for it to finish, which is the entire point: the editor wants to light up each
   * node the instant it starts, not after the whole run is already over.
   */
  async runWorkflow(id: string, input: unknown[], onEvent: (event: RunEvent) => void): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/workflows/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    const reader = res.body?.getReader();
    if (reader === undefined) return;

    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { events, remainder } = parseSseChunk<RunEvent>(buffer, decoder.decode(value, { stream: true }));
      buffer = remainder;
      for (const event of events) onEvent(event);
    }
  }

  async listCredentials(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/credentials`);
    return res.json() as Promise<string[]>;
  }

  async setCredential(name: string, data: Record<string, string>): Promise<void> {
    await fetch(`${this.baseUrl}/api/credentials/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteCredential(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/credentials/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  async listDeadLetter(): Promise<DeadLetterJob[]> {
    const res = await fetch(`${this.baseUrl}/api/dead-letter`);
    return res.json() as Promise<DeadLetterJob[]>;
  }

  async requeueDeadLetter(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/dead-letter/${encodeURIComponent(jobId)}/requeue`, { method: 'POST' });
  }
}
