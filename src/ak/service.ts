import {
  createAkId,
  decryptAkKey,
  deriveAkSearchPrefix,
  encryptAkKey
} from './crypto.js';
import { AkRepository } from './repository.js';
import {
  addAkRecordInputSchema,
  maskKey,
  normalizeAkKey,
  parseAkQueryFields
} from './schema.js';
import type { AkEnv, AkQueryField } from './types.js';
import type { AkRecordView } from './output.js';

export interface AkServiceDependencies {
  masterKey: Buffer;
  now: () => string;
  repository: AkRepository;
}

export interface AkGetInput {
  env?: AkEnv | undefined;
  id?: string | undefined;
  key?: string | undefined;
  rawKey?: boolean | undefined;
}

export interface AkListInput {
  env?: AkEnv | undefined;
  field?: string | undefined;
  limit?: number | undefined;
  query?: string | undefined;
  rawKey?: boolean | undefined;
}

export interface AkUpdateInput {
  email?: string | null | undefined;
  env?: AkEnv | undefined;
  id?: string | undefined;
  key?: string | undefined;
  phone?: string | null | undefined;
  rawKey?: boolean | undefined;
  userId?: string | null | undefined;
  userName?: string | null | undefined;
}

export interface AkDeleteInput {
  env?: AkEnv | undefined;
  id?: string | undefined;
  key?: string | undefined;
}

export class AkServiceError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode: number) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.name = 'AkServiceError';
  }
}

export class AkService {
  readonly #masterKey: Buffer;
  readonly #now: () => string;
  readonly #repository: AkRepository;

  constructor(dependencies: AkServiceDependencies) {
    this.#masterKey = dependencies.masterKey;
    this.#now = dependencies.now;
    this.#repository = dependencies.repository;
  }

  add(input: {
    email?: string | undefined;
    env: AkEnv;
    key: string;
    phone?: string | undefined;
    rawKey?: boolean | undefined;
    userId?: string | undefined;
    userName?: string | undefined;
  }): AkRecordView {
    const parsed = addAkRecordInputSchema.parse(input);
    const key = normalizeAkKey(parsed.key);
    const id = createAkId(key);
    const now = this.#now();

    this.#repository.insert({
      createdAt: now,
      email: normalizeNullableFieldForInsert(parsed.email),
      env: parsed.env,
      id,
      keyCiphertext: encryptAkKey(this.#masterKey, key),
      keySearchPrefix: deriveAkSearchPrefix(key),
      phone: normalizeNullableFieldForInsert(parsed.phone),
      updatedAt: now,
      userId: normalizeNullableFieldForInsert(parsed.userId),
      userName: normalizeNullableFieldForInsert(parsed.userName)
    });

    const record = this.#repository.getById(id);

    if (!record) {
      throw new AkServiceError('STORAGE_ERROR', 'Failed to load the newly created record.', 6);
    }

    return this.#toView(record, Boolean(input.rawKey));
  }

  get(input: AkGetInput): AkRecordView {
    const record = this.#findRecord(input);

    if (!record) {
      throw new AkServiceError('RECORD_NOT_FOUND', 'No API key record matched the query.', 3);
    }

    return this.#toView(record, Boolean(input.rawKey));
  }

  list(input: AkListInput): AkRecordView[] {
    const fields = parseFields(input.field);
    const limit = input.limit ?? 50;
    const filters = {
      fields,
      limit,
      ...(input.env ? { env: input.env } : {}),
      ...(input.query ? { query: input.query } : {})
    };
    const results = this.#repository.list(filters);

    return results.map((record) => this.#toView(record, Boolean(input.rawKey)));
  }

  update(input: AkUpdateInput): AkRecordView {
    const record = this.#findRecord(input);

    if (!record) {
      throw new AkServiceError('RECORD_NOT_FOUND', 'No API key record matched the query.', 3);
    }

    const normalizedEmail = normalizeNullableField(input.email);
    const normalizedPhone = normalizeNullableField(input.phone);
    const normalizedUserId = normalizeNullableField(input.userId);
    const normalizedUserName = normalizeNullableField(input.userName);
    const updated = this.#repository.updateMetadata({
      ...(normalizedEmail === undefined ? {} : { email: normalizedEmail }),
      id: record.id,
      ...(normalizedPhone === undefined ? {} : { phone: normalizedPhone }),
      updatedAt: this.#now(),
      ...(normalizedUserId === undefined ? {} : { userId: normalizedUserId }),
      ...(normalizedUserName === undefined ? {} : { userName: normalizedUserName })
    });

    if (!updated) {
      throw new AkServiceError('STORAGE_ERROR', 'Failed to update the API key record.', 6);
    }

    return this.#toView(updated, Boolean(input.rawKey));
  }

  delete(input: AkDeleteInput): boolean {
    const record = this.#findRecord(input);

    if (!record) {
      throw new AkServiceError('RECORD_NOT_FOUND', 'No API key record matched the query.', 3);
    }

    return this.#repository.deleteById(record.id);
  }

  #findRecord(input: AkGetInput | AkUpdateInput | AkDeleteInput) {
    if (input.id) {
      return this.#repository.getById(input.id);
    }

    if (input.env && input.key) {
      const normalizedKey = normalizeAkKey(input.key);
      return this.#repository.getByEnvAndId(input.env, createAkId(normalizedKey));
    }

    throw new AkServiceError(
      'INVALID_ARGUMENT',
      'Provide either --id or the pair of --env and --key.',
      2
    );
  }

  #toView(
    record: {
      createdAt: string;
      email: string | null;
      env: AkEnv;
      id: string;
      keyCiphertext: string;
      phone: string | null;
      updatedAt: string;
      userId: string | null;
      userName: string | null;
    },
    rawKey: boolean
  ): AkRecordView {
    const key = decryptAkKey(this.#masterKey, record.keyCiphertext);

    return {
      createdAt: record.createdAt,
      email: record.email,
      env: record.env,
      id: record.id,
      key: rawKey ? key : maskKey(key),
      phone: record.phone,
      updatedAt: record.updatedAt,
      userId: record.userId,
      userName: record.userName
    };
  }
}

function normalizeNullableField(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeNullableFieldForInsert(value: string | null | undefined): string | null {
  return normalizeNullableField(value) ?? null;
}

function parseFields(value: string | undefined): AkQueryField[] {
  try {
    return parseAkQueryFields(value);
  } catch (error) {
    /* v8 ignore next */
    const message = error instanceof Error ? error.message : 'Invalid query fields.';
    throw new AkServiceError('INVALID_ARGUMENT', message, 2);
  }
}
