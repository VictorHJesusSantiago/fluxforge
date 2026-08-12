import type { NodeRunner, NodeRunnerResolver } from '@fluxforge/core';
import { toNodeRunner, type CredentialResolver, type NodeDefinition } from '@fluxforge/sdk';

export class DuplicateNodeTypeError extends Error {
  constructor(type: string) {
    super(`a node with type "${type}" is already registered`);
    this.name = 'DuplicateNodeTypeError';
  }
}

/**
 * Where every node definition — built-in or third-party — ends up. `@fluxforge/server` is the
 * only package that populates one (importing `@fluxforge/node-*` packages and any third-party
 * ones from wherever they're installed); this class itself has zero opinions about *which*
 * nodes exist, which is what makes "install a package, call `registry.register(def)`" the whole
 * third-party integration story — nothing here is built-ins-aware.
 */
export class NodeRegistry {
  private readonly definitions = new Map<string, NodeDefinition<unknown>>();

  register(def: NodeDefinition<unknown>): void {
    if (this.definitions.has(def.type)) {
      throw new DuplicateNodeTypeError(def.type);
    }
    this.definitions.set(def.type, def);
  }

  /** Convenience for registering several at once — every `@fluxforge/node-*` package's index. */
  registerAll(defs: Iterable<NodeDefinition<unknown>>): void {
    for (const def of defs) this.register(def);
  }

  get(type: string): NodeDefinition<unknown> | undefined {
    return this.definitions.get(type);
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  list(): NodeDefinition<unknown>[] {
    return [...this.definitions.values()];
  }

  /**
   * A `NodeRunnerResolver` — what `WorkflowExecutor` actually takes — bound to one credential
   * resolver. Cheap and stateless beyond that binding, so a server calls this once per run with
   * that run's own credential set rather than mutating the registry per request.
   */
  createResolver(credentials?: CredentialResolver): NodeRunnerResolver {
    const cache = new Map<string, NodeRunner>();
    return {
      resolve: (type: string): NodeRunner | undefined => {
        const cached = cache.get(type);
        if (cached !== undefined) return cached;
        const def = this.definitions.get(type);
        if (def === undefined) return undefined;
        const runner = toNodeRunner(def, credentials);
        cache.set(type, runner);
        return runner;
      },
    };
  }
}
