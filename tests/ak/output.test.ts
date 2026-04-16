import { describe, expect, it } from 'vitest';

import {
  renderAkErrorAsJson,
  renderAkRecordsAsJson,
  renderAkRecordsAsTable
} from '../../src/ak/output.js';
import type { AkRecordView } from '../../src/ak/output.js';

const records: AkRecordView[] = [
  {
    createdAt: '2026-04-16T00:00:00.000Z',
    email: 'stephen@example.com',
    env: 'bzy-pre',
    id: 'abc123',
    key: 'op_s**************cdef',
    phone: '13800000000',
    updatedAt: '2026-04-16T01:00:00.000Z',
    userId: '1001',
    userName: 'Stephen'
  }
];

describe('renderAkRecordsAsJson', () => {
  it('renders a success payload', () => {
    expect(renderAkRecordsAsJson(records, 50)).toBe(`{
  "ok": true,
  "data": [
    {
      "id": "abc123",
      "env": "bzy-pre",
      "userId": "1001",
      "userName": "Stephen",
      "email": "stephen@example.com",
      "phone": "13800000000",
      "key": "op_s**************cdef",
      "createdAt": "2026-04-16T00:00:00.000Z",
      "updatedAt": "2026-04-16T01:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 50
  }
}`);
  });
});

describe('renderAkErrorAsJson', () => {
  it('renders an error payload', () => {
    expect(renderAkErrorAsJson('RECORD_NOT_FOUND', 'No match.')).toBe(`{
  "ok": false,
  "error": {
    "code": "RECORD_NOT_FOUND",
    "message": "No match."
  }
}`);
  });
});

describe('renderAkRecordsAsTable', () => {
  it('renders a table with a header and row values', () => {
    const rendered = renderAkRecordsAsTable(records);

    expect(rendered).toContain('env');
    expect(rendered).toContain('bzy-pre');
    expect(rendered).toContain('op_s**************cdef');
  });
});
