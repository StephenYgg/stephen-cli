# stephen-cli

`stephen-cli` is a personal TypeScript CLI built for agent-friendly workflows first and interactive terminal use second.

The current flagship command is `ak`, a local API key manager with:

- SQLite-backed local storage
- encrypted key persistence
- `sha1(key)` record IDs for compatibility with existing backend lookup behavior
- JSON-first output for scripts and agents
- table output for human inspection
- deterministic command contracts and exit codes

## Design Philosophy

`stephen-cli` follows a few strong rules:

- Machine-readable by default: commands return JSON unless table mode is explicitly requested.
- Local-first: commands should work offline and avoid unnecessary remote coupling.
- Secrets stay protected: sensitive values are encrypted at rest and masked in normal output.
- Small, composable layers: parsing, domain logic, storage, and rendering should stay separate.
- Test before behavior: production behavior is expected to be developed with TDD.

## Project Layout

```text
src/   source code
docs/  design docs and implementation plans
tests/ automated tests
```

Key modules for `ak`:

- `src/ak/schema.ts`: validation, field parsing, and masking helpers
- `src/ak/crypto.ts`: SHA-1 IDs, prefix indexing, and encryption helpers
- `src/ak/repository.ts`: SQLite persistence
- `src/ak/service.ts`: orchestration and domain behavior
- `src/ak/output.ts`: JSON and table rendering
- `src/ak/command.ts`: Commander-based CLI wiring

## Getting Started

Requirements:

- Node.js 22+
- npm

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run coverage:

```bash
npm run coverage
```

Build the CLI:

```bash
npm run build
```

## `ak` Command

The `ak` command manages API key records with these fields:

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

### Examples

Add a record:

```bash
stephen-cli ak add -e bzy-pre -k op_sk_abcdef123456 -n Stephen
```

Get a record:

```bash
stephen-cli ak get -e bzy-pre -k op_sk_abcdef123456
stephen-cli ak get --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e
```

List records:

```bash
stephen-cli ak list -e bzy-pre
stephen-cli ak list -q ste -f userName,email
stephen-cli ak list -q op_sk_ab -f key -t
```

Update metadata:

```bash
stephen-cli ak update -e bzy-pre -k op_sk_abcdef123456 -m new@example.com
```

Delete a record:

```bash
stephen-cli ak delete --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e --yes
```

### Output Rules

- Default output is JSON.
- `-t` or `--format table` switches to table rendering.
- `--raw-key` shows the full key.
- Without `--raw-key`, the key is masked.

### Query Rules

- `-q` / `--query` enables fuzzy search
- `-f` / `--field` selects searchable fields
- fuzzy search is supported for `userId`, `userName`, `email`, and `phone`
- `key` search is prefix-based only through a low-sensitivity prefix index

### Short Flags

- `-e` => `--env`
- `-u` => `--user-id`
- `-n` => `--user-name`
- `-m` => `--email`
- `-p` => `--phone`
- `-k` => `--key`
- `-q` => `--query`
- `-f` => `--field`
- `-t` => table output

## Storage Model

Runtime storage uses local SQLite. The full key is encrypted before persistence, while a small prefix index supports limited prefix search for `key`.

The persisted record shape is conceptually:

```ts
interface AkRecord {
  id: string;              // sha1(key)
  env: 'bzy-pre' | 'bzy-prod' | 'op-pre' | 'op-prod';
  userId: string | null;
  userName: string | null;
  email: string | null;
  phone: string | null;
  keyCiphertext: string;
  keySearchPrefix: string;
  createdAt: string;
  updatedAt: string;
}
```

## Verification Standard

Before calling work complete:

- run `npm test`
- run `npm run coverage`
- run `npm run build`

The project targets full unit coverage for the implemented modules.
