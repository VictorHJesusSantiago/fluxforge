import type { FluxforgeDb } from './db.js';
import { decrypt, encrypt } from './crypto.js';

interface CredentialRow {
  name: string;
  encrypted_data: string;
}

/**
 * Backs `@fluxforge/sdk`'s `CredentialResolver` interface — `getCredential(name)` — with rows
 * encrypted at rest via AES-256-GCM (`crypto.ts`). Stated plainly: this protects the SQLite file
 * at rest (a stolen backup, a misconfigured file share) — it does not protect a credential from
 * the running server process itself, which necessarily holds the encryption key in memory to
 * decrypt on every lookup. That is the same trust boundary every self-hosted secrets store has;
 * pretending otherwise would be the dishonest part, not the design itself.
 */
export class CredentialStore {
  constructor(
    private readonly db: FluxforgeDb,
    private readonly key: Buffer,
  ) {}

  set(name: string, data: Record<string, string>): void {
    const now = Date.now();
    const encrypted = encrypt(JSON.stringify(data), this.key);
    this.db
      .prepare(
        `INSERT INTO credentials (name, encrypted_data, created_at, updated_at)
         VALUES (@name, @data, @now, @now)
         ON CONFLICT(name) DO UPDATE SET encrypted_data = @data, updated_at = @now`,
      )
      .run({ name, data: encrypted, now });
  }

  getCredential(name: string): Record<string, string> | undefined {
    const row = this.db
      .prepare<{ name: string }, CredentialRow>(`SELECT * FROM credentials WHERE name = @name`)
      .get({ name }) as CredentialRow | undefined;
    if (row === undefined) return undefined;
    return JSON.parse(decrypt(row.encrypted_data, this.key)) as Record<string, string>;
  }

  delete(name: string): void {
    this.db.prepare(`DELETE FROM credentials WHERE name = @name`).run({ name });
  }

  list(): string[] {
    const rows = this.db.prepare(`SELECT name FROM credentials ORDER BY name`).all() as { name: string }[];
    return rows.map((r) => r.name);
  }
}
