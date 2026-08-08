import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

/** @type {Record<string,string>} */
const alias: Record<string, string> = {
  '@fluxforge/core': pkg('core'),
  '@fluxforge/queue': pkg('queue'),
  '@fluxforge/sdk': pkg('sdk'),
  '@fluxforge/registry': pkg('registry'),
};

// Every packages/nodes/<name> folder aliases to @fluxforge/node-<name> — discovered rather than
// hand-listed, since the whole point of the node system is that adding one is "create a folder,"
// not "also remember to edit three config files."
const nodesDir = `${root}packages/nodes`;
if (existsSync(nodesDir)) {
  for (const entry of readdirSync(nodesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = `${nodesDir}/${entry.name}/src/index.ts`;
    if (existsSync(indexPath)) {
      alias[`@fluxforge/node-${entry.name}`] = indexPath;
    }
  }
}

export default defineConfig({
  resolve: { alias },
  test: {
    include: [
      'packages/**/src/**/__tests__/**/*.test.ts',
      'examples/**/src/**/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});
