import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openDb, type FluxforgeDb } from '../db.js';
import { CredentialStore } from '../credential-store.js';

let db: FluxforgeDb;
let store: CredentialStore;

beforeEach(() => {
  db = openDb(':memory:');
  store = new CredentialStore(db, randomBytes(32));
});

describe('CredentialStore', () => {
  it('stores and retrieves a credential', () => {
    store.set('slack', { webhookUrl: 'https://hooks.slack.com/x' });
    expect(store.getCredential('slack')).toEqual({ webhookUrl: 'https://hooks.slack.com/x' });
  });

  it('returns undefined for an unknown credential', () => {
    expect(store.getCredential('nope')).toBeUndefined();
  });

  it('overwrites an existing credential on set()', () => {
    store.set('api', { token: 'old' });
    store.set('api', { token: 'new' });
    expect(store.getCredential('api')).toEqual({ token: 'new' });
  });

  it('actually encrypts at rest — the raw row does not contain the plaintext', () => {
    store.set('secret', { token: 'super-secret-value' });
    const row = db.prepare(`SELECT encrypted_data FROM credentials WHERE name = 'secret'`).get() as {
      encrypted_data: string;
    };
    expect(row.encrypted_data).not.toContain('super-secret-value');
  });

  it('delete() removes a credential', () => {
    store.set('temp', { x: '1' });
    store.delete('temp');
    expect(store.getCredential('temp')).toBeUndefined();
  });

  it('list() returns every stored credential name, sorted', () => {
    store.set('zeta', {});
    store.set('alpha', {});
    expect(store.list()).toEqual(['alpha', 'zeta']);
  });

  it('a different key cannot decrypt another store\'s data', () => {
    store.set('x', { token: 'value' });
    const wrongStore = new CredentialStore(db, randomBytes(32));
    expect(() => wrongStore.getCredential('x')).toThrow();
  });
});
