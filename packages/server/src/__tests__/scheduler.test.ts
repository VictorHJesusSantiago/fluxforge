import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type FluxforgeDb } from '../db.js';
import { WorkflowStore } from '../workflow-store.js';
import { CronScheduler } from '../scheduler.js';

let db: FluxforgeDb;
let workflowStore: WorkflowStore;

beforeEach(() => {
  db = openDb(':memory:');
  workflowStore = new WorkflowStore(db);
});

/** A trivial fake: "every-minute" schedules always fire on the next whole minute. */
function fakeNextFireTime(_expression: string, after: Date): Date {
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  return next;
}

describe('CronScheduler', () => {
  it('does not fire on first sight of a trigger — only schedules it', () => {
    workflowStore.save({
      id: 'wf1',
      name: 'x',
      definition: {
        id: 'wf1',
        name: 'x',
        nodes: [{ id: 'trig', type: 'trigger.cron', params: { expression: '* * * * *' } }],
        edges: [],
      },
    });

    const due: Array<[string, string]> = [];
    const scheduler = new CronScheduler(workflowStore, {
      computeNextFireTime: fakeNextFireTime,
      pollIntervalMs: 1000,
      now: () => new Date('2026-01-01T00:00:30.000Z'),
      onDue: (wfId, nodeId) => due.push([wfId, nodeId]),
    });

    scheduler.tick();
    expect(due).toEqual([]);
  });

  it('fires once the computed next-fire time has passed, then reschedules', () => {
    workflowStore.save({
      id: 'wf1',
      name: 'x',
      definition: {
        id: 'wf1',
        name: 'x',
        nodes: [{ id: 'trig', type: 'trigger.cron', params: { expression: '* * * * *' } }],
        edges: [],
      },
    });

    const due: Array<[string, string]> = [];
    let currentTime = new Date('2026-01-01T00:00:30.000Z');
    const scheduler = new CronScheduler(workflowStore, {
      computeNextFireTime: fakeNextFireTime,
      pollIntervalMs: 1000,
      now: () => currentTime,
      onDue: (wfId, nodeId) => due.push([wfId, nodeId]),
    });

    scheduler.tick(); // schedules for 00:01:00
    currentTime = new Date('2026-01-01T00:01:05.000Z');
    scheduler.tick(); // now past due — fires
    expect(due).toEqual([['wf1', 'trig']]);

    currentTime = new Date('2026-01-01T00:01:06.000Z');
    scheduler.tick(); // already rescheduled for 00:02:00 — not due yet
    expect(due).toEqual([['wf1', 'trig']]);
  });

  it('ignores disabled cron trigger nodes', () => {
    workflowStore.save({
      id: 'wf1',
      name: 'x',
      definition: {
        id: 'wf1',
        name: 'x',
        nodes: [{ id: 'trig', type: 'trigger.cron', params: { expression: '* * * * *' }, disabled: true }],
        edges: [],
      },
    });

    const due: unknown[] = [];
    const scheduler = new CronScheduler(workflowStore, {
      computeNextFireTime: fakeNextFireTime,
      pollIntervalMs: 1000,
      now: () => new Date('2026-06-01T00:05:00.000Z'),
      onDue: () => due.push(true),
    });
    scheduler.tick();
    scheduler.tick();
    expect(due).toEqual([]);
  });

  it('start()/stop() runs tick() repeatedly on the poll interval and stops cleanly', async () => {
    workflowStore.save({
      id: 'wf1',
      name: 'x',
      definition: { id: 'wf1', name: 'x', nodes: [], edges: [] },
    });
    let ticks = 0;
    const scheduler = new CronScheduler(workflowStore, {
      computeNextFireTime: fakeNextFireTime,
      pollIntervalMs: 1,
      sleep: () => new Promise((r) => setTimeout(r, 0)),
      onDue: () => {},
    });
    const originalTick = scheduler.tick.bind(scheduler);
    scheduler.tick = () => {
      ticks += 1;
      originalTick();
    };

    scheduler.start();
    await new Promise((r) => setTimeout(r, 20));
    await scheduler.stop();

    expect(ticks).toBeGreaterThan(1);
  });
});
