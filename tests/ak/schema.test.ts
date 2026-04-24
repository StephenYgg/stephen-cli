import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  AK_QUERY_FIELDS,
  AK_RECOMMENDED_ENVS,
  addAkRecordInputSchema,
  listAkRecordsInputSchema,
  maskKey,
  normalizeAkEnv,
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

  it('accepts the recommended built-in env values', () => {
    expect(
      addAkRecordInputSchema.parse({
        env: 'gitee',
        key: 'op_sk_abcdef123456'
      }).env
    ).toBe('gitee');
    expect(
      addAkRecordInputSchema.parse({
        env: 'github',
        key: 'op_sk_abcdef123456'
      }).env
    ).toBe('github');
    expect(
      addAkRecordInputSchema.parse({
        env: 'gitlab',
        key: 'op_sk_abcdef123456'
      }).env
    ).toBe('gitlab');
  });

  it('accepts a custom environment outside the recommended set', () => {
    expect(
      addAkRecordInputSchema.parse({
        env: 'team-a-prod',
        key: 'op_sk_abcdef123456'
      }).env
    ).toBe('team-a-prod');
  });
});

describe('normalizeAkEnv', () => {
  it('trims whitespace while preserving custom values', () => {
    expect(normalizeAkEnv('  team-a-prod  ')).toBe('team-a-prod');
  });

  it('rejects an empty env value', () => {
    expect(() => normalizeAkEnv('   ')).toThrow('Environment is required.');
  });

  it('rejects an invalid env format and shows recommended values', () => {
    expect(() => normalizeAkEnv('team a prod')).toThrow(
      `Recommended values: ${AK_RECOMMENDED_ENVS.join(', ')}.`
    );
  });

  it('surfaces env format problems through the schema parser', () => {
    let error: unknown;

    try {
      addAkRecordInputSchema.parse({
        env: 'team a prod',
        key: 'op_sk_abcdef123456'
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues[0]?.message).toContain(
      'Environment must use letters, numbers, ".", "_" or "-".'
    );
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
