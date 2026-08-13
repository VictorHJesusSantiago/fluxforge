import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { z, defineNode } from '@fluxforge/sdk';
import { NodeRegistry } from '@fluxforge/registry';
import { PersistentQueue } from '@fluxforge/queue';
import { openDb, type FluxforgeDb } from '../db.js';
import { WorkflowStore } from '../workflow-store.js';
import { RunStore } from '../run-store.js';
import { CredentialStore } from '../credential-store.js';
import { createHttpApp } from '../http.js';

const echo = defineNode({
  type: 'test.echo',
  displayName: 'Echo',
  description: 'Echoes input',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({}),
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});

const respond = defineNode({
  type: 'test.respond',
  displayName: 'Respond',
  description: 'Emits a response port',
  category: 'utility',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'response', label: 'Response' }],
  paramsSchema: z.object({ statusCode: z.number().default(200), body: z.unknown() }),
  async run(ctx) {
    return { response: [{ statusCode: ctx.params.statusCode, body: ctx.params.body }] };
  },
});

const webhookTrigger = defineNode({
  type: 'trigger.webhook',
  displayName: 'Webhook',
  description: 'Passes through the request',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({ path: z.string(), method: z.string().default('POST') }),
  async run(ctx) {
    return { main: ctx.input.main ?? [] };
  },
});

let db: FluxforgeDb;
let workflowStore: WorkflowStore;
let runStore: RunStore;
let credentialStore: CredentialStore;
let queue: PersistentQueue;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  db = openDb(':memory:');
  workflowStore = new WorkflowStore(db);
  runStore = new RunStore(db);
  credentialStore = new CredentialStore(db, randomBytes(32));
  queue = new PersistentQueue(':memory:');

  const registry = new NodeRegistry();
  registry.registerAll([echo, respond, webhookTrigger]);

  const app = createHttpApp({ registry, workflowStore, runStore, credentialStore, queue });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  queue.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('workflow CRUD', () => {
  it('creates, reads, updates, lists, and deletes a workflow', async () => {
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Flow', definition: { id: 'x', name: 'My Flow', nodes: [], edges: [] } }),
    });
    expect(createRes.status).toBe(201);
    const { id } = (await createRes.json()) as { id: string };

    const getRes = await fetch(`${baseUrl}/api/workflows/${id}`);
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).name).toBe('My Flow');

    const listRes = await fetch(`${baseUrl}/api/workflows`);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.map((w) => w.id)).toContain(id);

    const putRes = await fetch(`${baseUrl}/api/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', definition: { id, name: 'Renamed', nodes: [], edges: [] } }),
    });
    expect(putRes.status).toBe(204);
    expect((await (await fetch(`${baseUrl}/api/workflows/${id}`)).json()).name).toBe('Renamed');

    const delRes = await fetch(`${baseUrl}/api/workflows/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(204);
    expect((await fetch(`${baseUrl}/api/workflows/${id}`)).status).toBe(404);
  });

  it('404s for a missing workflow', async () => {
    expect((await fetch(`${baseUrl}/api/workflows/nope`)).status).toBe(404);
  });
});

describe('node registry endpoint', () => {
  it('lists every registered node with its ports', async () => {
    const res = await fetch(`${baseUrl}/api/nodes`);
    const nodes = (await res.json()) as Array<{ type: string }>;
    expect(nodes.map((n) => n.type).sort()).toEqual(['test.echo', 'test.respond', 'trigger.webhook']);
  });

  it('includes each node\'s params as a real JSON Schema object, for the editor\'s property panel', async () => {
    const res = await fetch(`${baseUrl}/api/nodes`);
    const nodes = (await res.json()) as Array<{ type: string; paramsSchema: { type: string; properties: Record<string, unknown> } }>;
    const respond = nodes.find((n) => n.type === 'test.respond');
    expect(respond?.paramsSchema.type).toBe('object');
    expect(Object.keys(respond?.paramsSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['statusCode', 'body']),
    );
  });
});

describe('running a workflow via SSE', () => {
  it('streams run.started and run.succeeded events and the run is queryable afterward', async () => {
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Echo flow',
        definition: { id: 'wf', name: 'Echo flow', nodes: [{ id: 'a', type: 'test.echo', params: {} }], edges: [] },
      }),
    });
    const { id } = (await createRes.json()) as { id: string };

    const runRes = await fetch(`${baseUrl}/api/workflows/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ x: 1 }] }),
    });
    expect(runRes.status).toBe(200);
    expect(runRes.headers.get('content-type')).toContain('text/event-stream');

    const text = await runRes.text();
    const events = text
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as { kind: string });

    expect(events.map((e) => e.kind)).toContain('run.started');
    expect(events.map((e) => e.kind)).toContain('run.succeeded');

    const runsRes = await fetch(`${baseUrl}/api/workflows/${id}/runs`);
    const runs = (await runsRes.json()) as Array<{ status: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('succeeded');
  });

  it('404s when running a workflow that does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/workflows/nope/run`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('credentials', () => {
  it('stores, lists, and deletes a credential without ever returning its value over the list endpoint', async () => {
    await fetch(`${baseUrl}/api/credentials/slack`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/x' }),
    });

    const listRes = await fetch(`${baseUrl}/api/credentials`);
    const list = (await listRes.json()) as string[];
    expect(list).toEqual(['slack']);
    expect(JSON.stringify(list)).not.toContain('hooks.slack.com');

    await fetch(`${baseUrl}/api/credentials/slack`, { method: 'DELETE' });
    expect((await (await fetch(`${baseUrl}/api/credentials`)).json())).toEqual([]);
  });
});

describe('dead-letter queue', () => {
  it('lists dead-lettered jobs and requeue() puts one back to pending', async () => {
    const jobId = queue.enqueue('workflow.run', { workflowId: 'x' }, { maxAttempts: 1 });
    queue.claim(1000);
    queue.fail(jobId, 'boom');
    expect(queue.getJob(jobId)?.status).toBe('dead');

    const listRes = await fetch(`${baseUrl}/api/dead-letter`);
    const list = (await listRes.json()) as Array<{ id: string; status: string; lastError?: string }>;
    expect(list.map((j) => j.id)).toContain(jobId);
    expect(list.find((j) => j.id === jobId)?.lastError).toBe('boom');

    const requeueRes = await fetch(`${baseUrl}/api/dead-letter/${jobId}/requeue`, { method: 'POST' });
    expect(requeueRes.status).toBe(204);
    expect(queue.getJob(jobId)?.status).toBe('pending');
  });

  it('an empty dead-letter queue returns an empty array, not an error', async () => {
    const res = await fetch(`${baseUrl}/api/dead-letter`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('webhook receiving', () => {
  it('routes an incoming request to the matching workflow and returns the respond-to-webhook node\'s output', async () => {
    await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Webhook flow',
        definition: {
          id: 'wfh',
          name: 'Webhook flow',
          nodes: [
            { id: 'trig', type: 'trigger.webhook', params: { path: '/hooks/test', method: 'POST' } },
            { id: 'resp', type: 'test.respond', params: { statusCode: 201, body: { received: true } } },
          ],
          edges: [{ from: 'trig', to: 'resp' }],
        },
      }),
    });

    const res = await fetch(`${baseUrl}/hooks/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: true });
  });

  it('404s for a path with no matching webhook trigger', async () => {
    const res = await fetch(`${baseUrl}/no/such/hook`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('enqueueing an async run', () => {
  it('accepts the request and the job becomes claimable on the queue', async () => {
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Async flow',
        definition: { id: 'async', name: 'Async flow', nodes: [], edges: [] },
      }),
    });
    const { id } = (await createRes.json()) as { id: string };

    const res = await fetch(`${baseUrl}/api/workflows/${id}/enqueue`, { method: 'POST' });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };
    expect(jobId).toBeTruthy();

    const claimed = queue.claim(5000);
    expect(claimed?.id).toBe(jobId);
    expect((claimed?.payload as { workflowId: string }).workflowId).toBe(id);
  });
});
