import Database from 'better-sqlite3';

export type AkDatabase = Database.Database;

export function createAkDatabase(filename = ':memory:'): AkDatabase {
  const database = new Database(filename);

  database.exec(`
    CREATE TABLE IF NOT EXISTS ak_records (
      id TEXT PRIMARY KEY,
      env TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      email TEXT,
      phone TEXT,
      key_ciphertext TEXT NOT NULL,
      key_search_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ak_env ON ak_records(env);
    CREATE INDEX IF NOT EXISTS idx_ak_user_id ON ak_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_ak_user_name ON ak_records(user_name);
    CREATE INDEX IF NOT EXISTS idx_ak_email ON ak_records(email);
    CREATE INDEX IF NOT EXISTS idx_ak_phone ON ak_records(phone);
    CREATE INDEX IF NOT EXISTS idx_ak_key_search_prefix ON ak_records(key_search_prefix);
    CREATE INDEX IF NOT EXISTS idx_ak_updated_at ON ak_records(updated_at);
  `);

  return database;
}
