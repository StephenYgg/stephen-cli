import { beforeEach, describe, expect, it } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import { AkRepository } from '../../src/ak/repository.js';
import {
  AkService,
  AkServiceError
} from '../../src/ak/service.js';

const masterKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

describe('AkService', () => {
  let service: AkService;

  beforeEach(() => {
    service = new AkService({
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository: new AkRepository(createAkDatabase(':memory:'))
    });
  });

  it('adds a record and returns a masked view by default', () => {
    const record = service.add({
      email: 'stephen@example.com',
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      phone: '13800000000',
      userId: '1001',
      userName: 'Stephen'
    });

    expect(record).toMatchObject({
      email: 'stephen@example.com',
      env: 'bzy-pre',
      key: 'op_s**********3456',
      userId: '1001',
      userName: 'Stephen'
    });
    expect(record.id).toBe('fdb441954fd4573a72fb5a52ce359e0d77c3fa0e');
  });

  it('accepts a custom env value and can fetch the record with the same env', () => {
    service.add({
      env: 'team-a-prod',
      key: 'op_sk_custom123456'
    });

    const record = service.get({
      env: 'team-a-prod',
      key: 'op_sk_custom123456'
    });

    expect(record.env).toBe('team-a-prod');
  });

  it('fails if a record cannot be reloaded after add', () => {
    const brokenService = new AkService({
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository: {
        deleteById: () => true,
        getByEnvAndId: () => null,
        getById: () => null,
        insert: () => undefined,
        list: () => [],
        updateMetadata: () => null
      } as unknown as AkRepository
    });

    expect(() =>
      brokenService.add({
        env: 'bzy-pre',
        key: 'op_sk_abcdef123456'
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'STORAGE_ERROR'
      })
    );
  });

  it('gets a record by env and key with the raw key when requested', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456'
    });

    const record = service.get({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      rawKey: true
    });

    expect(record.key).toBe('op_sk_abcdef123456');
  });

  it('lists records using a key prefix query', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: 'Stephen'
    });
    service.add({
      env: 'op-prod',
      key: 'op_sk_zzzzzz123456',
      userName: 'Alex'
    });

    const results = service.list({
      field: 'key',
      limit: 10,
      query: 'op_sk_ab'
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.userName).toBe('Stephen');
  });

  it('lists records with an explicit env filter and no query', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456'
    });
    service.add({
      env: 'op-prod',
      key: 'op_sk_zzzzzz123456'
    });

    const results = service.list({
      env: 'bzy-pre'
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.env).toBe('bzy-pre');
  });

  it('updates metadata without allowing direct key changes', () => {
    service.add({
      email: 'stephen@example.com',
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456'
    });

    const record = service.update({
      email: 'new@example.com',
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: 'Stephen Yang'
    });

    expect(record.email).toBe('new@example.com');
    expect(record.userName).toBe('Stephen Yang');
    expect(record.key).toBe('op_s**********3456');
  });

  it('returns not found when updating an unknown record', () => {
    expect(() =>
      service.update({
        id: 'missing'
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'RECORD_NOT_FOUND'
      })
    );
  });

  it('deletes a record by id', () => {
    const record = service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456'
    });

    expect(service.delete({ id: record.id })).toBe(true);
    expect(() => service.get({ id: record.id })).toThrow(AkServiceError);
  });

  it('defaults list fields when no field filter is supplied', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: 'Stephen'
    });

    const results = service.list({
      query: 'ste'
    });

    expect(results).toHaveLength(1);
  });

  it('rejects missing lookup arguments', () => {
    expect(() => service.get({})).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT'
      })
    );
  });

  it('returns not found when deleting an unknown record', () => {
    expect(() => service.delete({ id: 'missing' })).toThrowError(
      expect.objectContaining({
        code: 'RECORD_NOT_FOUND'
      })
    );
  });

  it('normalizes blank metadata fields to null on update', () => {
    service.add({
      email: 'stephen@example.com',
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: 'Stephen'
    });

    const updated = service.update({
      email: '',
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: ''
    });

    expect(updated.email).toBeNull();
    expect(updated.userName).toBeNull();
  });

  it('turns repository update misses into storage errors', () => {
    const brokenService = new AkService({
      masterKey,
      now: () => '2026-04-16T00:00:00.000Z',
      repository: {
        deleteById: () => true,
        getByEnvAndId: () => ({
          createdAt: '2026-04-16T00:00:00.000Z',
          email: null,
          env: 'bzy-pre',
          id: 'broken',
          keyCiphertext: 'broken',
          keySearchPrefix: 'op_sk_broken',
          phone: null,
          updatedAt: '2026-04-16T00:00:00.000Z',
          userId: null,
          userName: null
        }),
        getById: () => null,
        insert: () => undefined,
        list: () => [],
        updateMetadata: () => null
      } as unknown as AkRepository
    });

    expect(() =>
      brokenService.update({
        env: 'bzy-pre',
        key: 'op_sk_abcdef123456'
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'STORAGE_ERROR'
      })
    );
  });

  it('keeps explicit null metadata values as null', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: 'Stephen'
    });

    const updated = service.update({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      userName: null
    });

    expect(updated.userName).toBeNull();
  });

  it('updates phone and userId when they are explicitly supplied', () => {
    service.add({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456'
    });

    const updated = service.update({
      env: 'bzy-pre',
      key: 'op_sk_abcdef123456',
      phone: '13800138000',
      userId: '2001'
    });

    expect(updated.phone).toBe('13800138000');
    expect(updated.userId).toBe('2001');
  });
});
