import { describe, expect, it } from 'vitest';

import {
  createAkId,
  decryptAkKey,
  deriveAkSearchPrefix,
  encryptAkKey
} from '../../src/ak/crypto.js';

const masterKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

describe('createAkId', () => {
  it('creates a stable sha1 digest from a key', () => {
    expect(createAkId('op_sk_abcdef123456')).toBe(
      'fdb441954fd4573a72fb5a52ce359e0d77c3fa0e'
    );
  });
});

describe('deriveAkSearchPrefix', () => {
  it('keeps the first 12 characters by default', () => {
    expect(deriveAkSearchPrefix('op_sk_abcdef123456')).toBe('op_sk_abcdef');
  });
});

describe('encryptAkKey and decryptAkKey', () => {
  it('round-trips a key value', () => {
    const encrypted = encryptAkKey(masterKey, 'op_sk_abcdef123456');

    expect(encrypted).not.toBe('op_sk_abcdef123456');
    expect(decryptAkKey(masterKey, encrypted)).toBe('op_sk_abcdef123456');
  });

  it('rejects malformed encrypted payloads', () => {
    expect(() => decryptAkKey(masterKey, 'oops')).toThrow(
      'Invalid encrypted API key payload.'
    );
  });
});
