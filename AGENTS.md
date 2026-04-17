# AGENTS.md

This repository is intended to be comfortable for human contributors and predictable for coding agents.

## Mission

Build `stephen-cli` as a modern personal CLI with stable machine-facing behavior, strong tests, and small implementation units that agents can understand quickly.

## Working Rules

- Prefer JSON output by default for commands.
- Keep rendering concerns separate from business logic.
- Keep command parsing thin and push behavior into service or domain modules.
- Never print raw secrets unless the user explicitly asks for them with a dedicated flag.
- Keep runtime state out of the repository.

## Testing Expectations

- Use TDD for production behavior whenever practical.
- Write failing tests first for domain logic, storage behavior, and CLI behavior.
- Keep tests focused on real behavior, not mocks of implementation details.
- Preserve full coverage for implemented modules.

## `ak` Command Rules

- `id` is `sha1(key)`.
- `key` is encrypted before persistence.
- `env` remains a fixed `ak` enum: `bzy-pre`, `bzy-prod`, `op-pre`, `op-prod`, `gitee`, `github`, `gitlab`.
- default output is JSON.
- `-t` switches to table output.
- `--raw-key` is required to display the full key.
- `key` search is prefix-based only.
- direct key mutation is not allowed in `update`; use delete plus add instead.

## Architecture Preferences

- Favor dependency injection for anything touching storage, clocks, IO, or prompts.
- Prefer pure helpers for validation, masking, hashing, and formatting.
- Use SQLite for local persistence and keep repository APIs explicit.
- Keep files focused and small enough for agents to load without extra context.

## Documentation

- Keep `README.md` user-facing.
- Keep `AGENTS.md` and `CLAUDE.md` implementation-facing.
- Save design and planning artifacts under `docs/`.
