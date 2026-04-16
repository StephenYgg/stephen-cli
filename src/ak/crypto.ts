import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX_LENGTH = 12;

export function createAkId(key: string): string {
  return createHash('sha1').update(key).digest('hex');
}

export function deriveAkSearchPrefix(key: string, length = PREFIX_LENGTH): string {
  return key.slice(0, length);
}

export function encryptAkKey(masterKey: Buffer, key: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptAkKey(masterKey: Buffer, payload: string): string {
  const [ivPart, tagPart, encryptedPart] = payload.split('.');

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted API key payload.');
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    masterKey,
    Buffer.from(ivPart, 'base64url'),
    {
      authTagLength: AUTH_TAG_LENGTH
    }
  );

  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}
