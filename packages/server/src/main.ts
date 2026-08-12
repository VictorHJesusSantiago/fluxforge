import { PersistentQueue, QueueWorker } from '@fluxforge/queue';
import { NodeRegistry } from '@fluxforge/registry';
import { nextFireTime } from '@fluxforge/node-cron';
import { openDb } from './db.js';
import { WorkflowStore } from './workflow-store.js';
import { RunStore } from './run-store.js';
import { CredentialStore } from './credential-store.js';
import { getEncryptionKey } from './crypto.js';
import { ExecutionService } from './execution-service.js';
import { CronScheduler } from './scheduler.js';
import { registerBuiltinNodes } from './builtins.js';
import { createHttpApp } from './http.js';

/**
 * The real bootstrap — every piece this file wires together is independently constructible and
 * independently tested (see `__tests__/`); this is the one place they all meet, the same
 * "wiring lives in exactly one file" principle `@fluxforge/core`'s docs describe for its own
 * `Game`-equivalent. Nothing here is unit-testable *as this file* — it is glue, verified instead
 * by every piece it calls already having its own tests, plus `__tests__/http.test.ts`'s
 * full-stack exercise of `createHttpApp` with the same dependency shapes this function builds.
 */
async function main(): Promise<void> {
  const port = Number(process.env['PORT'] ?? 3000);
  const appDbPath = process.env['FLUXFORGE_DB_PATH'] ?? './fluxforge.sqlite';
  const queueDbPath = process.env['FLUXFORGE_QUEUE_DB_PATH'] ?? './fluxforge-queue.sqlite';

  const db = openDb(appDbPath);
  const workflowStore = new WorkflowStore(db);
  const runStore = new RunStore(db);
  const credentialStore = new CredentialStore(db, getEncryptionKey());

  const registry = new NodeRegistry();
  registerBuiltinNodes(registry);

  const queue = new PersistentQueue(queueDbPath);

  const executionService = new ExecutionService(registry, runStore, workflowStore, credentialStore);

  const worker = new QueueWorker(
    queue,
    async (job) => {
      if (job.type !== 'workflow.run') return;
      const { workflowId, initialInput } = job.payload as { workflowId: string; initialInput: unknown[] };
      await executionService.execute(workflowId, initialInput as never);
    },
    { visibilityTimeoutMs: 60_000, pollIntervalMs: 1000 },
  );
  worker.start();

  const scheduler = new CronScheduler(workflowStore, {
    computeNextFireTime: nextFireTime,
    pollIntervalMs: 15_000,
    onDue: (workflowId, _triggerNodeId) => {
      queue.enqueue('workflow.run', { workflowId, initialInput: [{}] }, { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000 });
    },
  });
  scheduler.start();

  const app = createHttpApp({ registry, workflowStore, runStore, credentialStore, queue });
  app.listen(port, () => {
    console.log(`FluxForge server listening on :${port}`);
  });

  const shutdown = async () => {
    scheduler.stop();
    await worker.stop();
    queue.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
