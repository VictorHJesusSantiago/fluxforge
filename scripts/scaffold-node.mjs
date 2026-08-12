#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `npm run scaffold:node -- <name> <category> "<Display Name>"`
 *
 * Generates the four files every node package needs (`package.json`, `tsconfig.json`,
 * `src/schema.ts`, `src/runtime.ts`, `src/index.ts`, `src/__tests__/<name>.test.ts`) so that
 * "add a new integration" is genuinely "run one command, fill in the logic" — this script *is*
 * the mechanism referenced everywhere in the docs as "how the node ecosystem scales to hundreds
 * of integrations without hundreds of hand-copied boilerplate files."
 */

const [, , rawName, rawCategory, rawDisplayName] = process.argv;

const CATEGORIES = ['trigger', 'action', 'logic', 'data', 'integration', 'utility'];

if (rawName === undefined || rawCategory === undefined) {
  console.error('usage: scaffold-node <name> <category> ["Display Name"]');
  console.error(`  <name>: kebab-case, becomes @fluxforge/node-<name> and type "<category>.<name>"`);
  console.error(`  <category>: one of ${CATEGORIES.join(', ')}`);
  process.exit(1);
}

if (!CATEGORIES.includes(rawCategory)) {
  console.error(`unknown category "${rawCategory}" — expected one of ${CATEGORIES.join(', ')}`);
  process.exit(1);
}

const name = rawName;
const category = rawCategory;
const displayName = rawDisplayName ?? name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pkgName = `@fluxforge/node-${name}`;
const nodeType = `${category}.${name}`;
const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = `${root}packages/nodes/${name}`;

if (existsSync(dir)) {
  console.error(`${dir} already exists — pick a different name or delete it first`);
  process.exit(1);
}

mkdirSync(`${dir}/src/__tests__`, { recursive: true });

writeFileSync(
  `${dir}/package.json`,
  JSON.stringify(
    {
      name: pkgName,
      version: '0.1.0',
      type: 'module',
      description: `TODO: describe what ${nodeType} does.`,
      license: 'MIT',
      exports: { '.': './src/index.ts' },
      types: './src/index.ts',
      files: ['src', 'dist'],
      dependencies: { '@fluxforge/sdk': '0.1.0' },
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  `${dir}/tsconfig.json`,
  JSON.stringify(
    {
      extends: '../../../tsconfig.base.json',
      compilerOptions: { outDir: 'dist', rootDir: 'src' },
      include: ['src'],
      exclude: ['src/**/__tests__/**'],
      references: [{ path: '../../sdk' }],
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  `${dir}/src/schema.ts`,
  `import { z } from '@fluxforge/sdk';

/** TODO: declare ${nodeType}'s params. */
export const ${camel}ParamsSchema = z.object({
  // example: z.string().describe('...'),
});

export type ${pascal(camel)}Params = z.infer<typeof ${camel}ParamsSchema>;
`,
);

writeFileSync(
  `${dir}/src/runtime.ts`,
  `import { defineNode } from '@fluxforge/sdk';
import { ${camel}ParamsSchema } from './schema.js';

export const ${camel}Node = defineNode({
  type: '${nodeType}',
  displayName: '${displayName}',
  description: 'TODO: describe what ${nodeType} does.',
  category: '${category}',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: ${camel}ParamsSchema,
  async run(ctx) {
    // TODO: implement. ctx.input.main is the incoming item array; return the outgoing one(s).
    return { main: ctx.input.main ?? [] };
  },
});
`,
);

writeFileSync(`${dir}/src/index.ts`, `export { ${camel}Node } from './runtime.js';\nexport { ${camel}ParamsSchema, type ${pascal(camel)}Params } from './schema.js';\n`);

writeFileSync(
  `${dir}/src/__tests__/${name}.test.ts`,
  `import { describe, it, expect } from 'vitest';
import { runNode } from '@fluxforge/sdk';
import { ${camel}Node } from '../runtime.js';

describe('${nodeType}', () => {
  it('TODO: replace with a real behavioural test', async () => {
    const output = await runNode(${camel}Node, {}, { main: [{ example: true }] });
    expect(output.main).toEqual([{ example: true }]);
  });
});
`,
);

console.log(`created packages/nodes/${name}/ (type "${nodeType}", package "${pkgName}")`);
console.log(`next: fill in src/schema.ts and src/runtime.ts, then run:`);
console.log(`  npm install`);
console.log(`  npx vitest run packages/nodes/${name}`);

function pascal(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
