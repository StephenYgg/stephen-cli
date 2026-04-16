import { describe, expect, it } from 'vitest';

import {
  AK_QUERY_FIELDS,
  addAkRecordInputSchema,
  listAkRecordsInputSchema,
  maskKey,
  normalizeAkKey,
  parseAkQueryFields
} from '../../src/ak/schema.js';

describe('normalizeAkKey', () => {
  it('trims leading and trailing whitespace while preserving case', () => {
    expect(normalizeAkKey('  Op_SK_AbCd1234  ')).toBe('Op_SK_AbCd1234');
  });

  it('rejects an empty key after trimming', () => {
    expect(() => normalizeAkKey('   ')).toThrow('API key cannot be empty.');
  });
});

describe('addAkRecordInputSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = addAkRecordInputSchema.parse({
      email: 'stephen@example.com',
      env: 'bzy-pre',
      key: '  op_sk_abcdef123456  ',
      phone: '13800000000',
      userId: '1001',
      userName: 'Stephen'
    });

    expect(parsed.env).toBe('bzy-pre');
    expect(parsed.key).toBe('op_sk_abcdef123456');
  });

  it('rejects an invalid environment', () => {
    expect(() =>
      addAkRecordInputSchema.parse({
        env: 'prod',
        key: 'op_sk_abcdef123456'
      })
    ).toThrow();
  });
});

describe('parseAkQueryFields', () => {
  it('returns all fields when no field list is provided', () => {
    expect(parseAkQueryFields(undefined)).toEqual(AK_QUERY_FIELDS);
  });

  it('parses and trims a comma-separated list', () => {
    expect(parseAkQueryFields(' userName, email ,key ')).toEqual([
      'userName',
      'email',
      'key'
    ]);
  });

  it('rejects unknown fields', () => {
    expect(() => parseAkQueryFields('userName,foo')).toThrow(
      'Unsupported query field: foo.'
    );
  });
});

describe('listAkRecordsInputSchema', () => {
  it('parses a valid list filter', () => {
    const parsed = listAkRecordsInputSchema.parse({
      env: 'op-prod',
      field: 'userName,email',
      limit: 10,
      query: 'ste'
    });

    expect(parsed.limit).toBe(10);
    expect(parsed.field).toBe('userName,email');
  });

  it('rejects a non-positive limit', () => {
    expect(() =>
      listAkRecordsInputSchema.parse({
        limit: 0
      })
    ).toThrow();
  });
});

describe('maskKey', () => {
  it('fully masks very short keys', () => {
    expect(maskKey('abc')).toBe('***');
  });

  it('masks a long key while preserving the head and tail', () => {
    expect(maskKey('op_sk_1234567890abcdef')).toBe('op_s**************cdef');
  });

  it('masks a short key with a smaller visible window', () => {
    expect(maskKey('abcdef12')).toBe('ab****12');
  });
});
