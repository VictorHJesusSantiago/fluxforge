import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RunEventBus, type RunEvent } from '@fluxforge/core';
import { z } from '@fluxforge/sdk';
import type { NodeRegistry } from '@fluxforge/registry';
import type { PersistentQueue } from '@fluxforge/queue';
import type { WorkflowStore } from './workflow-store.js';
import type { RunStore } from './run-store.js';
import type { CredentialStore } from './credential-store.js';
import { ExecutionService } from './execution-service.js';
import { findWebhookTarget, extractWebhookResponse } from './webhook-router.js';

export interface HttpAppDeps {
  registry: NodeRegistry;
  workflowStore: WorkflowStore;
  runStore: RunStore;
  credentialStore: CredentialStore;
  queue: PersistentQueue;
}

/**
 * The whole HTTP surface, as one function that takes its dependencies rather than reaching for
 * module-level singletons — what lets `__tests__/http.test.ts` spin up a real, fully-wired app
 * against an in-memory database and hit it with real `fetch` calls, no mocking of Express itself.
 */
export function createHttpApp(deps: HttpAppDeps): Express {
  const { registry, workflowStore, runStore, credentialStore, queue } = deps;
  const app = express();
  app.use(express.json());

  const executionServiceFor = (credentials: CredentialStore) =>
    new ExecutionService(registry, runStore, workflowStore, credentials);

  app.get('/api/nodes', (_req, res) => {
    res.json(
      registry.list().map((def) => ({
        type: def.type,
        displayName: def.displayName,
        description: def.description,
        category: def.category,
        icon: def.icon,
        inputs: def.inputs,
        outputs: def.outputs,
        paramsSchema: z.toJSONSchema(def.paramsSchema),
      })),
    );
  });

  app.get('/api/workflows', (_req, res) => {
    res.json(workflowStore.list());
  });

  app.post('/api/workflows', (req: Request, res: Response) => {
    const { name, definition } = req.body as { name?: string; definition?: unknown };
    if (typeof name !== 'string' || definition === undefined) {
      res.status(400).json({ error: 'body must include "name" and "definition"' });
      return;
    }
    const id = workflowStore.save({ name, definition: definition as never });
    res.status(201).json({ id });
  });

  app.get('/api/workflows/:id', (req: Request, res: Response) => {
    const def = workflowStore.tryGet(req.params.id as string);
    if (def === undefined) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(def);
  });

  app.put('/api/workflows/:id', (req: Request, res: Response) => {
    const { name, definition } = req.body as { name?: string; definition?: unknown };
    if (typeof name !== 'string' || definition === undefined) {
      res.status(400).json({ error: 'body must include "name" and "definition"' });
      return;
    }
    workflowStore.save({ id: req.params.id as string, name, definition: definition as never });
    res.status(204).end();
  });

  app.delete('/api/workflows/:id', (req: Request, res: Response) => {
    workflowStore.delete(req.params.id as string);
    res.status(204).end();
  });

  app.get('/api/workflows/:id/runs', (req: Request, res: Response) => {
    res.json(runStore.listForWorkflow(req.params.id as string));
  });

  app.post('/api/workflows/:id/run', async (req: Request, res: Response) => {
    const workflowId = req.params.id as string;
    if (workflowStore.tryGet(workflowId) === undefined) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const bus = new RunEventBus();
    bus.subscribe((event: RunEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const initialInput = Array.isArray(req.body?.input) ? req.body.input : [{}];
    try {
      await executionServiceFor(credentialStore).execute(workflowId, initialInput, bus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(`data: ${JSON.stringify({ kind: 'server.error', message })}\n\n`);
    } finally {
      res.end();
    }
  });

  app.post('/api/workflows/:id/enqueue', (req: Request, res: Response) => {
    const workflowId = req.params.id as string;
    if (workflowStore.tryGet(workflowId) === undefined) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const initialInput = Array.isArray(req.body?.input) ? req.body.input : [{}];
    const jobId = queue.enqueue('workflow.run', { workflowId, initialInput }, { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000 });
    res.status(202).json({ jobId });
  });

  app.get('/api/runs/:id', (req: Request, res: Response) => {
    const state = runStore.get(req.params.id as string);
    if (state === undefined) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(state);
  });

  app.post('/api/runs/:id/resume', async (req: Request, res: Response) => {
    try {
      const state = await executionServiceFor(credentialStore).resume(req.params.id as string);
      res.json(state);
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/credentials', (_req, res) => {
    res.json(credentialStore.list());
  });

  app.put('/api/credentials/:name', (req: Request, res: Response) => {
    credentialStore.set(req.params.name as string, req.body as Record<string, string>);
    res.status(204).end();
  });

  app.delete('/api/credentials/:name', (req: Request, res: Response) => {
    credentialStore.delete(req.params.name as string);
    res.status(204).end();
  });

  app.get('/api/dead-letter', (_req, res) => {
    res.json(queue.deadLetter());
  });

  app.post('/api/dead-letter/:id/requeue', (req: Request, res: Response) => {
    queue.requeue(req.params.id as string);
    res.status(204).end();
  });

  app.all(/.*/, async (req: Request, res: Response) => {
    const workflows = workflowStore.list().map((w) => workflowStore.get(w.id));
    const match = findWebhookTarget(workflows, req.path, req.method);
    if (match === undefined) {
      res.status(404).json({ error: 'no workflow, and no webhook trigger, matches this request' });
      return;
    }

    const runId = randomUUID();
    void runId;
    try {
      const state = await executionServiceFor(credentialStore).execute(match.workflowId, [
        { ...(typeof req.body === 'object' && req.body !== null ? req.body : {}), query: req.query },
      ]);
      const response = extractWebhookResponse(state);
      if (response !== undefined) {
        res.status(response.statusCode).json(response.body);
      } else {
        res.status(state.status === 'succeeded' ? 200 : 500).json({ runId: state.runId, status: state.status });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return app;
}
