import Database from 'better-sqlite3';

import type { AkDatabase } from './database.js';
import type { AkEnv, AkQueryField, AkRecord } from './types.js';

interface AkRecordRow {
  created_at: string;
  email: string | null;
  env: AkEnv;
  id: string;
  key_ciphertext: string;
  key_search_prefix: string;
  phone: string | null;
  updated_at: string;
  user_id: string | null;
  user_name: string | null;
}

export interface AkListFilters {
  env?: AkEnv;
  fields?: AkQueryField[];
  limit: number;
  query?: string;
}

export interface AkUpdateMetadataInput {
  email?: string | null;
  id: string;
  phone?: string | null;
  updatedAt: string;
  userId?: string | null;
  userName?: string | null;
}

export class AkDuplicateRecordError extends Error {
  constructor(id: string) {
    super(`API key record already exists: ${id}.`);
    this.name = 'AkDuplicateRecordError';
  }
}

export class AkRepository {
  readonly #database: AkDatabase;

  constructor(database: AkDatabase) {
    this.#database = database;
  }

  insert(record: AkRecord): void {
    try {
      this.#database
        .prepare(
          `INSERT INTO ak_records (
            id,
            env,
            user_id,
            user_name,
            email,
            phone,
            key_ciphertext,
            key_search_prefix,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @env,
            @userId,
            @userName,
            @email,
            @phone,
            @keyCiphertext,
            @keySearchPrefix,
            @createdAt,
            @updatedAt
          )`
        )
        .run(record);
    } catch (error) {
      if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new AkDuplicateRecordError(record.id);
      }

      throw error;
    }
  }

  getById(id: string): AkRecord | null {
    const row = this.#database
      .prepare('SELECT * FROM ak_records WHERE id = ?')
      .get(id) as AkRecordRow | undefined;

    return row ? mapRowToRecord(row) : null;
  }

  getByEnvAndId(env: AkEnv, id: string): AkRecord | null {
    const row = this.#database
      .prepare('SELECT * FROM ak_records WHERE env = ? AND id = ?')
      .get(env, id) as AkRecordRow | undefined;

    return row ? mapRowToRecord(row) : null;
  }

  list(filters: AkListFilters): AkRecord[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters.env) {
      conditions.push('env = ?');
      params.push(filters.env);
    }

    if (filters.query && filters.fields && filters.fields.length > 0) {
      const normalizedQuery = filters.query.toLowerCase();
      const fieldConditions = filters.fields.map((field) => {
        if (field === 'key') {
          params.push(`${filters.query}%`);
          return 'key_search_prefix LIKE ?';
        }

        const column = fieldToColumn(field);
        params.push(`%${normalizedQuery}%`);
        return `LOWER(COALESCE(${column}, '')) LIKE ?`;
      });

      conditions.push(`(${fieldConditions.join(' OR ')})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit);

    const rows = this.#database
      .prepare(
        `SELECT * FROM ak_records
         ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(...params) as AkRecordRow[];

    return rows.map(mapRowToRecord);
  }

  updateMetadata(input: AkUpdateMetadataInput): AkRecord | null {
    const current = this.getById(input.id);

    if (!current) {
      return null;
    }

    const row = this.#database
      .prepare(
        `UPDATE ak_records
         SET user_id = @userId,
             user_name = @userName,
             email = @email,
             phone = @phone,
             updated_at = @updatedAt
         WHERE id = @id
         RETURNING *`
      )
      .get({
        email: input.email === undefined ? current.email : input.email,
        id: input.id,
        phone: input.phone === undefined ? current.phone : input.phone,
        updatedAt: input.updatedAt,
        userId: input.userId === undefined ? current.userId : input.userId,
        userName: input.userName === undefined ? current.userName : input.userName
      }) as AkRecordRow | undefined;

    if (!row) {
      return null;
    }

    return mapRowToRecord(row);
  }

  deleteById(id: string): boolean {
    const result = this.#database.prepare('DELETE FROM ak_records WHERE id = ?').run(id);

    return result.changes > 0;
  }
}

function fieldToColumn(field: Exclude<AkQueryField, 'key'>): string {
  switch (field) {
    case 'userId':
      return 'user_id';
    case 'userName':
      return 'user_name';
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
  }
}

function mapRowToRecord(row: AkRecordRow): AkRecord {
  return {
    createdAt: row.created_at,
    email: row.email,
    env: row.env,
    id: row.id,
    keyCiphertext: row.key_ciphertext,
    keySearchPrefix: row.key_search_prefix,
    phone: row.phone,
    updatedAt: row.updated_at,
    userId: row.user_id,
    userName: row.user_name
  };
}
