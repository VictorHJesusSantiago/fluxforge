# FluxForge

**An open-source workflow automation engine, written from scratch in real TypeScript.**

n8n and Zapier are the reference points, not dependencies — nothing here is built on top of
either. A DAG executor with retry/backoff and crash-safe partial re-execution, a persistent
SQLite-backed job queue, a pluggable node system with a real third-party SDK, and a canvas-based
visual editor built with no diagramming library.

---

## Status

Every milestone in [docs/ROADMAP.md](docs/ROADMAP.md) is complete: the DAG executor, the
persistent queue, the SDK, 17 built-in nodes, the server, and the editor — including pan/zoom,
direct edge deletion, a credentials panel, and a dead-letter-queue view. **364 tests across 47
files**, all passing, plus a live end-to-end pass in a real headless browser that drag-connects
two nodes on the canvas, edits a property, saves, runs, pans and zooms, creates and deletes a
credential through the UI, opens the dead-letter panel, and confirms against the server's own
REST API that the executed workflow matches exactly what was drawn — a pass that caught and fixed
a real bug (a hidden modal that silently kept intercepting clicks) while this last stretch of
work was being built, not just a rubber-stamp. What remains is stated plainly in the roadmap, not
glossed over: a hosted demo instance (needs somewhere to deploy to) and a "loop until condition"
graph construct (deliberately out of scope — the DAG executor has no cycles by design).

Nothing in this README describes something that is not in the repository.

---

## Packages

| Package | What it does | Depends on |
| --- | --- | --- |
| [`@fluxforge/core`](packages/core) | DAG types, graph compilation, the executor, retry/backoff, partial-execution resume | — |
| [`@fluxforge/queue`](packages/queue) | Persistent SQLite job queue: visibility-timeout claims, backoff retry, dead-lettering | core |
| [`@fluxforge/sdk`](packages/sdk) | `defineNode()` — the entire third-party node authoring contract | core, zod |
| [`@fluxforge/registry`](packages/registry) | Collects `NodeDefinition`s, exposes a credential-bound executor resolver | core, sdk |
| [`@fluxforge/node-*`](packages/nodes) | 17 real node packages — trigger/logic/data/integration/utility | sdk only |
| [`@fluxforge/server`](packages/server) | REST API, SSE run streaming, webhook receiver, cron scheduler, encrypted credentials | core, queue, registry, sdk, every node |
| [`@fluxforge/editor`](packages/editor) | The canvas-based visual workflow editor | core (types), sdk (types) |

---

## Quick start

```bash
npm install
npm test                                    # 364 tests, every package
FLUXFORGE_CREDENTIALS_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
  npm run dev:server                        # the API at http://localhost:3000
npm run dev:editor                          # the editor at http://localhost:5180
npm run scaffold:node -- my-node action "My Node"   # generate a new node package
```

A minimal workflow, end to end, without the editor:

```bash
curl -s -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d @examples/webhook-echo.json

curl -s -X POST http://localhost:3000/hooks/echo -d '{}' -H 'Content-Type: application/json'
# -> {"ok":true}
```

See [examples/](examples) for two complete, loadable workflows and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how a run actually happens end to end.

---

## Writing a node

The complete surface, from `@fluxforge/sdk`:

```ts
import { defineNode, z } from '@fluxforge/sdk';

export const doubleNode = defineNode({
  type: 'math.double',
  displayName: 'Double',
  description: 'Doubles a numeric field on every item.',
  category: 'data',
  inputs: [{ id: 'main', label: 'Input' }],
  outputs: [{ id: 'main', label: 'Output' }],
  paramsSchema: z.object({ field: z.string() }),
  async run(ctx) {
    return {
      main: (ctx.input.main ?? []).map((item) => ({
        ...item,
        [ctx.params.field]: (item[ctx.params.field] as number) * 2,
      })),
    };
  },
});
```

`npm run scaffold:node -- double data "Double"` generates this file layout for you
(`package.json`, `tsconfig.json`, `src/schema.ts`, `src/runtime.ts`, a starter test) — the exact
mechanism every one of the 17 built-in nodes was built with.

---

## Design decisions worth arguing about

Each written up as an ADR in [docs/adr](docs/adr), with the rejected alternative and why:

- **A strict DAG — "loop" is a node behavior, not a graph shape.** ([ADR-0002](docs/adr/0002-dag-not-cyclic-graph.md))
  A cyclic graph has no well-defined topological order for partial-resume to reason about.
- **SQLite for both the queue and the app database.** ([ADR-0003](docs/adr/0003-sqlite-for-queue-and-app-state.md))
  Redis and Postgres are both better at scale; neither is what a solo-developer, self-hosted tool
  should require just to start.
- **Real TypeScript with `tsc -b` project references, but `package.json` points at `src/`.**
  ([ADR-0004](docs/adr/0004-typescript-project-references.md)) Zero-build internal dev loop, a
  real compiled `dist/` for external consumers.
- **A visibility timeout, not a `running` state plus a heartbeat sweep.**
  ([ADR-0005](docs/adr/0005-visibility-timeout-queue-model.md)) Crash recovery falls out of the
  claim model itself; no second process to run and monitor.

The full contract — every numbered invariant the code and tests reference — is in
[docs/SPEC.md](docs/SPEC.md).

---

## License

MIT — see [LICENSE](LICENSE).
