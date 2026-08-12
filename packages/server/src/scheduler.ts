import type { WorkflowDefinition } from '@fluxforge/core';
import type { WorkflowStore } from './workflow-store.js';

export interface CronTriggerParams {
  expression: string;
}

export interface SchedulerOptions {
  /** Injected rather than imported from `@fluxforge/node-cron` directly, so this class stays
   *  testable with a hand-written fake schedule function and has no compile-time dependency on
   *  which package happens to implement cron parsing — `main.ts` is the only place that wires
   *  the real one in. */
  computeNextFireTime: (expression: string, after: Date) => Date;
  pollIntervalMs: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  onDue: (workflowId: string, triggerNodeId: string) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Every `trigger.cron` node found across every stored workflow, id plus its params. */
function findCronTriggers(workflow: WorkflowDefinition): Array<{ nodeId: string; params: CronTriggerParams }> {
  return workflow.nodes
    .filter((n) => n.type === 'trigger.cron' && !n.disabled)
    .map((n) => ({ nodeId: n.id, params: n.params as unknown as CronTriggerParams }));
}

/**
 * Polls every stored workflow's `trigger.cron` nodes and calls `onDue` once each's computed next
 * fire time has passed — `onDue` is expected to enqueue a `workflow.run` job (see `main.ts`), not
 * run the workflow itself, so a scheduler tick is never blocked on a slow execution.
 *
 * **Per-trigger `lastFired` tracking**, not a single scheduler-wide clock, is what makes this
 * correct across a restart: on first sight of a trigger node, the next fire time is computed
 * from "now," not from some remembered epoch — a workflow added five minutes ago does not
 * immediately fire for every minute it "missed" while the scheduler wasn't running yet.
 */
export class CronScheduler {
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nextFireAt = new Map<string, Date>();
  private stopped = false;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly workflowStore: WorkflowStore,
    private readonly options: SchedulerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? defaultSleep;
  }

  start(): void {
    if (this.loopPromise !== undefined) return;
    this.stopped = false;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  /** One poll pass — exposed directly so tests don't have to fight a real poll-interval timer. */
  tick(): void {
    const now = this.now();
    for (const workflow of this.workflowStore.list()) {
      const def = this.workflowStore.tryGet(workflow.id);
      if (def === undefined) continue;

      for (const trigger of findCronTriggers(def)) {
        const key = `${def.id}:${trigger.nodeId}`;
        let next = this.nextFireAt.get(key);
        if (next === undefined) {
          next = this.options.computeNextFireTime(trigger.params.expression, now);
          this.nextFireAt.set(key, next);
          continue; // first sighting — schedule, don't fire immediately
        }

        if (next.getTime() <= now.getTime()) {
          this.options.onDue(def.id, trigger.nodeId);
          this.nextFireAt.set(key, this.options.computeNextFireTime(trigger.params.expression, now));
        }
      }
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      this.tick();
      await this.sleep(this.options.pollIntervalMs);
    }
  }
}
