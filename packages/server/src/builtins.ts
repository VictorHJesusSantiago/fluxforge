import type { NodeRegistry } from '@fluxforge/registry';
import { ifNode } from '@fluxforge/node-if';
import { httpRequestNode } from '@fluxforge/node-http-request';
import { manualNode } from '@fluxforge/node-manual';
import { cronNode } from '@fluxforge/node-cron';
import { webhookNode } from '@fluxforge/node-webhook';
import { switchNode } from '@fluxforge/node-switch';
import { filterNode } from '@fluxforge/node-filter';
import { setNode } from '@fluxforge/node-set';
import { aggregateNode } from '@fluxforge/node-aggregate';
import { codeNode } from '@fluxforge/node-code';
import { noOpNode } from '@fluxforge/node-no-op';
import { respondToWebhookNode } from '@fluxforge/node-respond-to-webhook';
import { slackWebhookNode } from '@fluxforge/node-slack-webhook';
import { discordWebhookNode } from '@fluxforge/node-discord-webhook';
import { githubIssueNode } from '@fluxforge/node-github-issue';
import { rssReadNode } from '@fluxforge/node-rss-read';
import { googleSheetsAppendNode } from '@fluxforge/node-google-sheets-append';

/**
 * Registers every node that ships with FluxForge itself. This is the *only* file that knows
 * every built-in node package exists — `@fluxforge/registry`'s `NodeRegistry` class has no idea,
 * and neither does `@fluxforge/core`. A third-party node is registered the exact same way, from
 * a deployment's own bootstrap code: import the package, call `registry.register(theNode)`.
 */
export function registerBuiltinNodes(registry: NodeRegistry): void {
  registry.registerAll([
    manualNode,
    cronNode,
    webhookNode,
    ifNode,
    switchNode,
    filterNode,
    setNode,
    aggregateNode,
    codeNode,
    httpRequestNode,
    noOpNode,
    respondToWebhookNode,
    slackWebhookNode,
    discordWebhookNode,
    githubIssueNode,
    rssReadNode,
    googleSheetsAppendNode,
  ]);
}
