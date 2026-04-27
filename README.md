# stephen

`stephen` is a personal TypeScript CLI built for agent-friendly workflows first and interactive terminal use second.

The current flagship command is `ak`, a local API key manager. The CLI also includes a conservative Windows disk cleanup command for low-risk cache cleanup.

Roadmap work is underway for a new `video` command group focused on browser-assisted media detection, media downloads, and local video compression.

`ak` provides:

- SQLite-backed local storage
- encrypted key persistence
- `sha1(key)` record IDs for compatibility with existing backend lookup behavior
- JSON-first output for scripts and agents
- table output for human inspection
- deterministic command contracts and exit codes

## Design Philosophy

`stephen` follows a few strong rules:

- Machine-readable by default: commands return JSON unless table mode is explicitly requested.
- Local-first: commands should work offline and avoid unnecessary remote coupling.
- Secrets stay protected: sensitive values are encrypted at rest and masked in normal output.
- Small, composable layers: parsing, domain logic, storage, and rendering should stay separate.
- Test before behavior: production behavior is expected to be developed with TDD.

## Project Layout

```text
src/   source code
docs/  local design notes and references
tests/ automated tests
```

Key modules for `ak`:

- `src/ak/schema.ts`: validation, field parsing, and masking helpers
- `src/ak/crypto.ts`: SHA-1 IDs, prefix indexing, and encryption helpers
- `src/ak/runtime.ts`: local config loading and storage path resolution
- `src/ak/repository.ts`: SQLite persistence
- `src/ak/service.ts`: orchestration and domain behavior
- `src/ak/output.ts`: JSON and table rendering
- `src/ak/command.ts`: Commander-based CLI wiring

Key modules for `disk cleanup`:

- `src/disk/types.ts`: shared report shapes
- `src/disk/runtime.ts`: filesystem and process integration
- `src/disk/service.ts`: conservative cleanup orchestration
- `src/disk/output.ts`: JSON and table rendering
- `src/disk/command.ts`: Commander-based CLI wiring

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

## Roadmap

Planned next major capability: `video`

- `video sniff`: inspect a page or media URL and return candidate downloadable video resources in JSON by default
- `video download`: download supported media inputs including page URLs, `m3u8` streams, and direct `mp4` links
- `video compress`: compress local video with `ffmpeg`

Current direction for `video`:

- browser-first detection for sites that only reveal media requests during real page execution
- HTTP-based fallback detection for simpler pages and direct media links
- a unified candidate model so `sniff` and `download` can handle `m3u8` and `mp4` consistently
- `ffmpeg`-backed compression with default `mp4` output, `h265` video, `aac` audio, and `64k` default audio bitrate
- explicit parameter support for resolution, video bitrate, audio bitrate, concurrency, request headers, and output selection

Planned defaults:

- JSON output first, with optional table mode when it improves readability
- `video sniff` mode default: `auto`, preferring browser-based detection before HTTP fallback
- `video compress` output default: `mp4`
- `video compress` video codec default: `h265`
- `video compress` audio codec default: `aac`
- `video compress` audio bitrate default: `64k`
- resolution unchanged unless the user passes an explicit resize option

Supporting documents:

- [2026-04-27-video-command-solution-report.md](/D:/Development/Stephen/PersonalCli/docs/2026-04-27-video-command-solution-report.md)
- [2026-04-27-video-command-implementation-plan.md](/D:/Development/Stephen/PersonalCli/docs/2026-04-27-video-command-implementation-plan.md)

## `ak` Command

The `ak` command manages API key records with these fields:

- `env`
- `userId`
- `userName`
- `email`
- `phone`
- `key`

Recommended environments:

- `bzy-pre`
- `bzy-prod`
- `op-pre`
- `op-prod`
- `gitee`
- `github`
- `gitlab`

`env` now accepts custom machine-friendly values. The built-in values above remain the recommended defaults and are shown in CLI help and validation messages.

### Examples

Add a record:

```bash
stephen ak add -e bzy-pre -k op_sk_abcdef123456 -n Stephen
stephen ak add -e team-a-prod -k op_sk_abcdef123456 -n Stephen
```

Get a record:

```bash
stephen ak get -e bzy-pre -k op_sk_abcdef123456
stephen ak get --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e
```

List records:

```bash
stephen ak list -e bzy-pre
stephen ak list -q ste -f userName,email
stephen ak list -q op_sk_ab -f key -t
```

Update metadata:

```bash
stephen ak update -e bzy-pre -k op_sk_abcdef123456 -m new@example.com
```

Delete a record:

```bash
stephen ak delete --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e --yes
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

The database path resolves in this order:

1. local config file `<config dir>/config.json` with `ak.dbPath`
2. `STEPHEN_AK_DB_PATH`
3. legacy `STEPHEN_CLI_AK_DB_PATH`
4. default `env-paths` data directory

This keeps `ak` local-first while letting each machine point to a different synced directory such as iDrive.

### iDrive Setup

For a synced setup, keep the config local and point the database file into the local iDrive folder on each machine.

PowerShell example:

```powershell
$env:STEPHEN_AK_DB_PATH = 'D:\iDrive\stephen\ak.db'
```

Local config file example:

```json
{
  "ak": {
    "dbPath": "D:\\iDrive\\stephen\\ak.db"
  }
}
```

If both are present, the local config file wins. `config get` and `config list` will still show the environment variable in `envValue`, but the effective `source` becomes `"config"`. `STEPHEN_CLI_AK_DB_PATH` is still accepted as a legacy fallback for existing machines.

## `config` Command

The `config` command manages local CLI configuration values.

Current supported keys:

- `ak.dbPath`

### Examples

List all config values and their effective sources:

```bash
stephen config list
```

Get one config value:

```bash
stephen config get ak.dbPath
```

Set one config value in the local config file:

```bash
stephen config set ak.dbPath D:\iDrive\stephen\ak.db
```

`config set` always writes the local config file. If `STEPHEN_AK_DB_PATH` or the legacy `STEPHEN_CLI_AK_DB_PATH` is also set, the file config still has higher priority for the effective runtime value, and `config get` / `config list` will show `source: "config"`.

The persisted record shape is conceptually:

```ts
interface AkRecord {
  id: string;              // sha1(key)
  env: string;             // recommended values exist, custom values allowed
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

## `disk cleanup` Command

The `disk cleanup` command provides a conservative Windows cleanup workflow aimed at reclaiming cache space without touching high-risk application data.

Current cleanup targets:

- `%USERPROFILE%\AppData\Local\npm-cache`
- `%USERPROFILE%\AppData\Local\NuGet`
- `%USERPROFILE%\.cache`
- `%USERPROFILE%\.m2`
- `%USERPROFILE%\AppData\Local\Temp`
- `%SystemRoot%\SoftwareDistribution\Download`

### Examples

Preview cleanup results in JSON:

```bash
stephen disk cleanup
```

Apply conservative cleanup:

```bash
stephen disk cleanup --apply
```

Apply cleanup and disable Windows hibernation:

```bash
stephen disk cleanup --apply --disable-hibernate
```

Render cleanup targets as a table:

```bash
stephen disk cleanup -t
```

### Output Rules

- Default output is JSON.
- `-t` or `--format table` switches to table rendering.
- Preview mode is the default.
- `--apply` is required before any cleanup is executed.

## Verification Standard

Before calling work complete:

- run `npm test`
- run `npm run coverage`
- run `npm run build`

The project targets full unit coverage for the implemented modules.
