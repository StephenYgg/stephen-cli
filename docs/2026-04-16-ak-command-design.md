# `stephen-cli ak` Design Document

## 1. Overview

`ak` is the API key management command set in `stephen-cli`, designed primarily for personal use and secondarily for agent consumption.

This command group manages API key records with the following goals:

- Local-first and offline-friendly
- JSON-first output for agents and scripts
- Human-friendly table output for manual inspection
- Encrypted storage for sensitive key material
- Stable, predictable command behavior
- Easy future extension without breaking command contracts

The short command name is:

```bash
stephen-cli ak
```

## 2. Scope

The first version of `ak` covers:

- Add records
- Query records
- Update records
- Delete records
- Local encrypted persistence
- JSON and table output
- Exact key lookup and low-sensitivity key prefix search

It does not include:

- Remote API storage
- Remote database access
- Multi-user collaboration
- Automatic Git or Gitee sync
- Arbitrary fuzzy search over encrypted full key values

## 3. Record Model

Each record stores the following logical fields:

- `env`
- `userId`
- `userName`
- `email`
- `phone`
- `key`

Supported environments:

- `bzy-pre`
- `bzy-prod`
- `op-pre`
- `op-prod`

### 3.1 Persisted Schema

Recommended persisted schema:

```ts
type AkEnv = 'bzy-pre' | 'bzy-prod' | 'op-pre' | 'op-prod';

interface AkRecord {
  id: string;               // sha1(normalizedKey)
  env: AkEnv;
  userId: string | null;
  userName: string | null;
  email: string | null;
  phone: string | null;
  keyCiphertext: string;    // encrypted key
  keySearchPrefix: string;  // prefix index used for low-sensitivity key search
  createdAt: string;        // ISO-8601
  updatedAt: string;        // ISO-8601
}
```

### 3.2 Identity Rules

Confirmed rules:

- `id = sha1(normalizedKey)`
- `key` is treated as globally unique in practice
- Precise key lookup can be performed by either:
  - `env + key`
  - `id`

Notes:

- This design intentionally aligns with the existing server-side SHA-1 matching behavior.
- SHA-1 here is used as a stable identifier, not as encryption.
- Because `id` is derived from the key, the CLI must still encrypt the full key before writing it to local storage.

### 3.3 Normalization Rules

For V1, the recommended normalization rule is intentionally minimal:

- trim leading and trailing whitespace from `key`
- do not lowercase `key`
- treat `key` as case-sensitive

This avoids accidental semantic changes to tokens issued by external systems.

## 4. Storage Architecture

## 4.1 Chosen Storage Strategy

Chosen solution:

- Runtime storage: local SQLite
- Sensitive field protection: application-layer encryption for `key`
- Sync strategy: manual export/import later if needed

This is the recommended "Scheme A variant":

- Better query capabilities than local JSON/YAML
- Better constraints and indexing than file-based storage
- Much lighter than remote API or remote database access
- Better fit for a personal CLI tool

## 4.2 Why Not the Other Options

### Local plain files

Rejected as primary storage because:

- fuzzy query and indexing are weak
- record uniqueness is awkward to enforce
- updates and deletes are less robust
- schema evolution becomes messy over time

### Remote API or remote MySQL

Rejected for V1 because:

- unnecessary operational complexity
- not aligned with personal offline-first usage
- introduces network, auth, and availability concerns

## 4.3 SQLite Table Design

Recommended table structure:

```sql
CREATE TABLE ak_records (
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
```

Recommended indexes:

```sql
CREATE INDEX idx_ak_env ON ak_records(env);
CREATE INDEX idx_ak_user_id ON ak_records(user_id);
CREATE INDEX idx_ak_user_name ON ak_records(user_name);
CREATE INDEX idx_ak_email ON ak_records(email);
CREATE INDEX idx_ak_phone ON ak_records(phone);
CREATE INDEX idx_ak_key_search_prefix ON ak_records(key_search_prefix);
CREATE INDEX idx_ak_updated_at ON ak_records(updated_at);
```

## 4.4 Local File Placement

The CLI should follow platform data directories instead of keeping runtime state in the project root.

Conceptually:

- config directory: CLI settings and encryption metadata
- data directory: SQLite database
- state directory: logs or transient runtime files

Examples by purpose:

- `config.json`
- `ak.db`
- encryption metadata if needed

The repository `docs` folder stores design and project docs only, not runtime secrets.

## 5. Encryption and Sensitive Data Policy

## 5.1 Confirmed Policy

Confirmed rules:

- `key` is encrypted before local persistence
- query returns masked key by default
- explicit `--raw-key` is required to show the full key

## 5.2 Display Masking

Suggested masking behavior:

- long key: show first 4 characters and last 4 characters
- short key: show first 2 and last 2 when possible

Examples:

```text
op_sk_1234567890abcdef -> op_s************cdef
abcdef12 -> ab****12
```

## 5.3 Logging Policy

The CLI must never print full key material in:

- default JSON responses
- table output
- error messages
- logs
- debug traces

Only `--raw-key` may reveal the full key in command output.

## 6. Search Model

## 6.1 Query Types

The search model should support:

- exact environment filter
- exact record lookup by `id`
- exact record lookup by `key`
- fuzzy lookup on:
  - `userId`
  - `userName`
  - `email`
  - `phone`
- low-sensitivity prefix search for `key`
- result limiting

## 6.2 Exact Filters

Recommended exact filters:

- `--env`
- `--id`
- `--key`

Use exact lookup when:

- selecting one known record
- updating a record
- deleting a record

## 6.3 Fuzzy Search

Recommended fuzzy search interface:

- `--query` or `-q`
- `--field` or `-f`

Examples:

```bash
stephen-cli ak list -q ste -f userName,email
stephen-cli ak list -q 138 -f phone
```

Recommended fuzzy-searchable fields:

- `userId`
- `userName`
- `email`
- `phone`
- `key`

## 6.4 Key Search Design

Because the full key is encrypted at rest, arbitrary substring fuzzy search over the full key is not appropriate for V1.

Chosen compromise:

- support low-sensitivity key prefix search
- persist a prefix index in `keySearchPrefix`
- use a fixed searchable prefix length

Recommended rule:

- strip surrounding whitespace
- preserve original case
- store the first 12 characters of the normalized key in `keySearchPrefix`

Example:

```text
key = op_sk_abcdef1234567890
keySearchPrefix = op_sk_abcdef
```

This allows common prefix-based search patterns while limiting exposure of the full secret.

Important constraint:

- key search is prefix-based only
- arbitrary middle-substring key search is not supported

## 6.5 Limit and Ordering

The query command must support:

- `--limit <n>`

Recommended default sort:

- `updatedAt DESC`

Recommended default limit:

- `50`

Reason:

- safe for interactive usage
- bounded enough for agent use
- still useful for manual inspection

## 7. Command Set

Recommended command set:

```bash
stephen-cli ak add
stephen-cli ak get
stephen-cli ak list
stephen-cli ak update
stephen-cli ak delete
```

Future optional commands:

```bash
stephen-cli ak export
stephen-cli ak import
```

## 7.1 `add`

Purpose:

- create a new record

Recommended arguments:

```bash
stephen-cli ak add \
  -e bzy-pre \
  -u 1001 \
  -n stephen \
  -m stephen@example.com \
  -p 13800000000 \
  -k op_sk_abcdef123456
```

Behavior:

- validate `env`
- normalize `key`
- compute `id = sha1(normalizedKey)`
- fail if `id` already exists
- encrypt `key`
- derive `keySearchPrefix`
- store record
- return masked record by default

## 7.2 `get`

Purpose:

- retrieve a single known record

Recommended lookup patterns:

```bash
stephen-cli ak get --id <sha1>
stephen-cli ak get -e bzy-pre -k op_sk_abcdef123456
```

Behavior:

- return one matching record
- show masked key unless `--raw-key` is provided

## 7.3 `list`

Purpose:

- query records using filters and fuzzy search

Examples:

```bash
stephen-cli ak list -e bzy-pre
stephen-cli ak list -q ste -f userName,email
stephen-cli ak list -q 138 -f phone
stephen-cli ak list -q op_sk_abcdef -f key
stephen-cli ak list --limit 20
```

Behavior:

- exact filter by `env`
- fuzzy filter by `query + field`
- key uses prefix search only
- apply result limit
- default to JSON output

## 7.4 `update`

Purpose:

- update metadata fields of an existing record

Confirmed rule:

- `key` itself is not directly updatable

Lookup patterns:

```bash
stephen-cli ak update --id <sha1> -n "Stephen Yang"
stephen-cli ak update -e bzy-pre -k op_sk_abcdef123456 -m new@example.com
```

Behavior:

- locate record by `id`, or by `env + key`
- allow updating:
  - `userId`
  - `userName`
  - `email`
  - `phone`
- reject attempts to update `key`

If key rotation is needed, the intended workflow is:

1. delete old record
2. add new record

## 7.5 `delete`

Purpose:

- remove a known record

Examples:

```bash
stephen-cli ak delete --id <sha1>
stephen-cli ak delete -e bzy-pre -k op_sk_abcdef123456 --yes
```

Behavior:

- support delete by `id`
- support delete by `env + key`
- ask for confirmation by default
- allow `--yes` for non-interactive or agent usage

## 8. Flag Design

## 8.1 Confirmed Short Flags

Confirmed short flag mapping:

- `-e` => `--env`
- `-u` => `--user-id`
- `-n` => `--user-name`
- `-m` => `--email`
- `-p` => `--phone`
- `-k` => `--key`
- `-q` => `--query`
- `-f` => `--field`
- `-t` => table output shortcut

Reasoning:

- avoids flag conflicts
- matches common CLI expectations
- stays ergonomic without inventing non-standard multi-character short flags

## 8.2 Long Flags

Recommended long flags:

- `--id`
- `--env`
- `--user-id`
- `--user-name`
- `--email`
- `--phone`
- `--key`
- `--query`
- `--field`
- `--limit`
- `--format`
- `--raw-key`
- `--yes`

## 8.3 Output Flags

Recommended output behavior:

- default format: JSON
- `-t` is equivalent to `--format table`

Examples:

```bash
stephen-cli ak list -e bzy-pre
stephen-cli ak list -e bzy-pre -t
stephen-cli ak get --id abc123 --raw-key
```

## 9. Output Contract

## 9.1 Default Output: JSON

Modern agent-facing CLI tools should default to JSON because JSON is:

- easy for agents to parse
- easy for scripts to pipe and transform
- stable across terminal styles
- safer for automation than human-oriented text blocks

Suggested JSON success shape:

```json
{
  "ok": true,
  "data": [
    {
      "id": "b9d5...",
      "env": "bzy-pre",
      "userId": "1001",
      "userName": "Stephen",
      "email": "stephen@example.com",
      "phone": "13800000000",
      "key": "op_s************cdef",
      "createdAt": "2026-04-16T10:00:00.000Z",
      "updatedAt": "2026-04-16T10:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 50
  }
}
```

Suggested JSON error shape:

```json
{
  "ok": false,
  "error": {
    "code": "RECORD_NOT_FOUND",
    "message": "No API key record matched the query."
  }
}
```

## 9.2 Table Output

Table output is intended for humans, not machines.

Confirmed choice:

- use the [`table`](https://www.npmjs.com/package/table) package

Why `table` is recommended:

- clean text table rendering
- good control over column formatting
- a better fit for a reusable rendering layer than ad hoc manual padding

Suggested visible columns:

- `id`
- `env`
- `userId`
- `userName`
- `email`
- `phone`
- `key`
- `updatedAt`

`key` stays masked unless `--raw-key` is used.

## 10. Validation Rules

Recommended validation rules:

- `env` must be one of the four supported values
- `key` is required for add
- `key` cannot be empty after trimming
- `email` should be validated only lightly in V1
- `phone` should be stored as text, not numeric
- `limit` must be a positive integer
- `field` values must be from the allowed field list

Recommended allowed values for `--field`:

- `userId`
- `userName`
- `email`
- `phone`
- `key`

## 11. Error Handling and Exit Codes

Recommended exit code policy:

- `0` success
- `2` invalid arguments
- `3` record not found
- `4` duplicate record
- `5` encryption or decryption failure
- `6` storage failure

Suggested error codes:

- `INVALID_ARGUMENT`
- `RECORD_NOT_FOUND`
- `DUPLICATE_RECORD`
- `KEY_UPDATE_NOT_ALLOWED`
- `ENCRYPTION_FAILED`
- `DECRYPTION_FAILED`
- `STORAGE_ERROR`

## 12. Recommended Tech Stack

Recommended implementation choices for V1:

- CLI framework: `commander`
- validation: `zod`
- storage: `better-sqlite3`
- encryption and hashing: Node.js `crypto`
- output tables: `table`
- data/config path handling: `env-paths` or equivalent

Why these fit:

- widely used and stable
- simple enough for a personal CLI
- suitable for both agent and human-facing workflows

## 13. Agent-Facing Design Principles

This command should follow these principles:

### JSON first

Default output must be machine-readable.

### Explicit human mode

Table output is opt-in with `-t`.

### Stable contracts

Output structure, error codes, and lookup behavior should be predictable.

### Minimize secret exposure

Keys are encrypted at rest and masked by default in output.

### Exact operations must be deterministic

Update and delete should operate on exact targets only.

### Storage and display should stay separate

The persistence model should not leak directly into the CLI UX.

## 14. Final V1 Decisions

Confirmed V1 decisions for `stephen-cli ak`:

- Use local SQLite as runtime storage
- Encrypt `key` before persistence
- Use `sha1(key)` as the record `id`
- Support exact lookup by `id`
- Support exact lookup by `env + key`
- Support fuzzy query for `userId`, `userName`, `email`, and `phone`
- Support prefix-based key search using a low-sensitivity prefix index
- Default output to JSON
- Support table output through `-t` / `--format table`
- Use the `table` npm package for table rendering
- Do not allow direct key mutation in `update`
- Use delete + add for key replacement workflows

## 15. Open Implementation Notes

These are implementation notes, not unresolved design blockers:

- decide where the encryption master key is stored
- define the exact key prefix length as a constant, recommended `12`
- define the exact JSON response typing in TypeScript
- decide whether `get` should return an object or a single-item array in JSON
- decide whether empty string updates should clear fields or be rejected

Recommended defaults:

- key prefix length: `12`
- `get` returns a single object, not an array
- empty string for metadata fields should be normalized to `null`

## 16. Recommended Next Step

The next step after this design is to create an implementation plan for:

- project bootstrap structure
- `ak` command architecture
- SQLite repository layer
- crypto utility layer
- JSON and table output renderers
- command tests
