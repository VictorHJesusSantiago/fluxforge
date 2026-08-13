import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'FLUXFORGE_CREDENTIALS_KEY is not set. Credentials are stored encrypted at rest and this ' +
        'process needs a 32-byte key, base64-encoded, to do that — generate one with ' +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"`.',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

/**
 * AES-256-GCM, via Node's own `node:crypto` — no external dependency, and the standard,
 * currently-recommended choice for authenticated symmetric encryption. `encrypt`/`decrypt` are
 * pure functions of `(plaintext, key)`/`(ciphertext, key)`; the key itself is read from
 * `process.env` exactly once, in `credential-store.ts`, so these two functions stay unit-testable
 * with an arbitrary key and no environment coupling.
 */
export function getEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env['FLUXFORGE_CREDENTIALS_KEY'];
  if (raw === undefined || raw === '') throw new MissingEncryptionKeyError();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`FLUXFORGE_CREDENTIALS_KEY must decode to exactly 32 bytes, got ${key.length}`);
  }
  return key;
}

/** `iv:authTag:ciphertext`, each base64, colon-joined — a plain string so it drops straight into a TEXT column. */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(encrypted: string, key: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('decrypt: malformed ciphertext (expected "iv:authTag:data")');
  const [ivB64, authTagB64, dataB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
