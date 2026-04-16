import { table } from 'table';

import type { AkEnv } from './types.js';

export interface AkRecordView {
  createdAt: string;
  email: string | null;
  env: AkEnv;
  id: string;
  key: string;
  phone: string | null;
  updatedAt: string;
  userId: string | null;
  userName: string | null;
}

export function renderAkRecordsAsJson(records: AkRecordView[], limit: number): string {
  const serializedRecords = records.map((record) => ({
    id: record.id,
    env: record.env,
    userId: record.userId,
    userName: record.userName,
    email: record.email,
    phone: record.phone,
    key: record.key,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }));

  return JSON.stringify(
    {
      ok: true,
      data: serializedRecords,
      meta: {
        count: serializedRecords.length,
        limit
      }
    },
    null,
    2
  );
}

export function renderAkErrorAsJson(code: string, message: string): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code,
        message
      }
    },
    null,
    2
  );
}

export function renderAkRecordsAsTable(records: AkRecordView[]): string {
  return table([
    ['id', 'env', 'userId', 'userName', 'email', 'phone', 'key', 'updatedAt'],
    ...records.map((record) => [
      record.id,
      record.env,
      record.userId ?? '',
      record.userName ?? '',
      record.email ?? '',
      record.phone ?? '',
      record.key,
      record.updatedAt
    ])
  ]);
}
