import { defineNode } from '@fluxforge/sdk';
import { cronParamsSchema } from './schema.js';

export { parseCron, nextFireTime, CronParseError, type ParsedCron, type CronField } from './cron.js';

/**
 * A schedule-triggered workflow start. The *decision* of when to fire — polling or otherwise
 * calling `nextFireTime` to know when this node's workflow is due — is `@fluxforge/server`'s job
 * (being built in parallel); this node only declares the schedule (`expression`/`timezone`) and,
 * when actually invoked (because the server decided it's time), does the trivial thing: emit one
 * item recording when it fired. No inputs — like `trigger.manual`, this is a root/trigger node.
 */
export const cronNode = defineNode({
  type: 'trigger.cron',
  displayName: 'Cron Trigger',
  description: 'Starts a workflow run on a schedule described by a 5-field cron expression (UTC only, for now).',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: cronParamsSchema,
  async run() {
    return { main: [{ firedAt: new Date().toISOString() }] };
  },
});
