import { beforeEach, describe, expect, it } from 'vitest';

import { createAkDatabase } from '../../src/ak/database.js';
import {
  AkDuplicateRecordError,
  AkRepository
} from '../../src/ak/repository.js';
import type { AkRecord } from '../../src/ak/types.js';

function createStoredRecord(overrides: Partial<AkRecord> = {}): AkRecord {
  const now = '2026-04-16T00:00:00.000Z';

  return {
    createdAt: now,
    email: 'stephen@example.com',
    env: 'bzy-pre',
    id: 'fdb441954fd4573a72fb5a52ce359e0d77c3fa0e',
    keyCiphertext: 'encrypted-key',
    keySearchPrefix: 'op_sk_abcdef',
    phone: '13800000000',
    updatedAt: now,
    userId: '1001',
    userName: 'Stephen',
    ...overrides
  };
}

describe('AkRepository', () => {
  let repository: AkRepository;

  beforeEach(() => {
    repository = new AkRepository(createAkDatabase(':memory:'));
  });

  it('inserts and retrieves a record by id', () => {
    const record = createStoredRecord();

    repository.insert(record);

    expect(repository.getById(record.id)).toEqual(record);
  });

  it('rejects a duplicate record id', () => {
    const record = createStoredRecord();

    repository.insert(record);

    expect(() => repository.insert(record)).toThrow(AkDuplicateRecordError);
  });

  it('retrieves a record by env and id', () => {
    const record = createStoredRecord({
      env: 'op-prod',
      id: 'abc123'
    });

    repository.insert(record);

    expect(repository.getByEnvAndId('op-prod', 'abc123')).toEqual(record);
  });

  it('lists records by environment', () => {
    repository.insert(createStoredRecord());
    repository.insert(
      createStoredRecord({
        env: 'op-prod',
        id: 'second-id',
        userName: 'Other'
      })
    );

    expect(repository.list({ env: 'bzy-pre', limit: 10 })).toEqual([
      createStoredRecord()
    ]);
  });

  it('lists all records when no filters are provided', () => {
    repository.insert(createStoredRecord());

    expect(repository.list({ limit: 10 })).toEqual([createStoredRecord()]);
  });

  it('supports fuzzy search across metadata fields', () => {
    repository.insert(createStoredRecord());
    repository.insert(
      createStoredRecord({
        email: 'other@example.com',
        id: 'second-id',
        userName: 'Alex'
      })
    );

    const results = repository.list({
      fields: ['userName', 'email'],
      limit: 10,
      query: 'ste'
    });

    expect(results).toEqual([createStoredRecord()]);
  });

  it('supports prefix search on key', () => {
    repository.insert(createStoredRecord());
    repository.insert(
      createStoredRecord({
        id: 'second-id',
        keySearchPrefix: 'op_sk_zzzzzz'
      })
    );

    const results = repository.list({
      fields: ['key'],
      limit: 10,
      query: 'op_sk_ab'
    });

    expect(results).toEqual([createStoredRecord()]);
  });

  it('updates mutable metadata fields without touching the key fields', () => {
    const record = createStoredRecord();

    repository.insert(record);

    const updated = repository.updateMetadata({
      email: 'new@example.com',
      id: record.id,
      phone: '13900000000',
      updatedAt: '2026-04-16T01:00:00.000Z',
      userName: 'Stephen Yang'
    });

    expect(updated).toEqual(
      createStoredRecord({
        email: 'new@example.com',
        phone: '13900000000',
        updatedAt: '2026-04-16T01:00:00.000Z',
        userName: 'Stephen Yang'
      })
    );
  });

  it('supports clearing fields with explicit null values', () => {
    const record = createStoredRecord();

    repository.insert(record);

    const updated = repository.updateMetadata({
      email: null,
      id: record.id,
      updatedAt: '2026-04-16T01:00:00.000Z',
      userId: null,
      userName: null
    });

    expect(updated).toEqual(
      createStoredRecord({
        email: null,
        updatedAt: '2026-04-16T01:00:00.000Z',
        userId: null,
        userName: null
      })
    );
  });

  it('preserves omitted fields during metadata updates', () => {
    const record = createStoredRecord();

    repository.insert(record);

    const updated = repository.updateMetadata({
      id: record.id,
      phone: '13900000000',
      updatedAt: '2026-04-16T01:00:00.000Z'
    });

    expect(updated).toEqual(
      createStoredRecord({
        phone: '13900000000',
        updatedAt: '2026-04-16T01:00:00.000Z'
      })
    );
  });

  it('returns null when updating a missing record', () => {
    expect(
      repository.updateMetadata({
        id: 'missing',
        updatedAt: '2026-04-16T01:00:00.000Z'
      })
    ).toBeNull();
  });

  it('deletes a record by id', () => {
    const record = createStoredRecord();

    repository.insert(record);
    expect(repository.deleteById(record.id)).toBe(true);
    expect(repository.getById(record.id)).toBeNull();
  });

  it('returns null when env and id do not match any record', () => {
    expect(repository.getByEnvAndId('bzy-pre', 'missing')).toBeNull();
  });

  it('supports fuzzy search on userId and phone fields', () => {
    repository.insert(createStoredRecord());

    const userIdResults = repository.list({
      fields: ['userId'],
      limit: 10,
      query: '100'
    });
    const phoneResults = repository.list({
      fields: ['phone'],
      limit: 10,
      query: '1380'
    });

    expect(userIdResults).toEqual([createStoredRecord()]);
    expect(phoneResults).toEqual([createStoredRecord()]);
  });

  it('rethrows unexpected sqlite insert errors', () => {
    const database = createAkDatabase(':memory:');
    const brokenRepository = new AkRepository(database);
    database.close();

    expect(() => brokenRepository.insert(createStoredRecord())).toThrow();
  });
});
