import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, getEncryptionKey, MissingEncryptionKeyError } from '../crypto.js';

describe('encrypt / decrypt', () => {
  const key = randomBytes(32);

  it('round-trips plaintext', () => {
    const ciphertext = encrypt('hello world', key);
    expect(decrypt(ciphertext, key)).toBe('hello world');
  });

  it('round-trips JSON payloads', () => {
    const payload = JSON.stringify({ token: 'abc123', nested: { a: 1 } });
    expect(decrypt(encrypt(payload, key), key)).toBe(payload);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const a = encrypt('same input', key);
    const b = encrypt('same input', key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe('same input');
    expect(decrypt(b, key)).toBe('same input');
  });

  it('fails to decrypt with the wrong key (authentication failure, not silent garbage)', () => {
    const ciphertext = encrypt('secret', key);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const ciphertext = encrypt('secret', key);
    const parts = ciphertext.split(':');
    const tampered = [parts[0], parts[1], Buffer.from('tampered').toString('base64')].join(':');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decrypt('not-even-three-parts', key)).toThrow(/malformed/);
  });
});

describe('getEncryptionKey', () => {
  it('throws MissingEncryptionKeyError when unset', () => {
    expect(() => getEncryptionKey({})).toThrow(MissingEncryptionKeyError);
  });

  it('throws when the key does not decode to 32 bytes', () => {
    expect(() => getEncryptionKey({ FLUXFORGE_CREDENTIALS_KEY: Buffer.from('too short').toString('base64') })).toThrow(
      /32 bytes/,
    );
  });

  it('accepts a valid 32-byte base64 key', () => {
    const validKey = randomBytes(32).toString('base64');
    const key = getEncryptionKey({ FLUXFORGE_CREDENTIALS_KEY: validKey });
    expect(key).toHaveLength(32);
  });
});
