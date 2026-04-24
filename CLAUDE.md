# CLAUDE.md

This file captures project-specific guidance for contributors and code agents working on `stephen`.

## Project Intent

`stephen` is a personal TypeScript CLI focused on agent-compatible workflows. The current priority is the `ak` command set for local API key management.

## Priority Behaviors

- Return JSON by default.
- Treat CLI output as a contract.
- Keep the `ak` command local-first and deterministic.
- Encrypt the stored `key`.
- Use `sha1(key)` as the record identifier.
- Only reveal the raw key when `--raw-key` is explicitly provided.

## Implementation Constraints

- Use Commander for command wiring.
- Use Zod for validation at the CLI boundary.
- Use `better-sqlite3` for local persistence.
- Use the `table` package for table rendering.
- Keep service logic separate from command parsing.

## `ak` Domain Notes

- Supported env values are `bzy-pre`, `bzy-prod`, `op-pre`, `op-prod`, `gitee`, `github`, and `gitlab`.
- `env` is still a fixed field on `ak` records, not a separately managed sub-resource.
- `key` search is prefix-only through a low-sensitivity prefix index.
- `update` may change metadata fields, but not the key itself.
- `delete` supports exact lookup by `id` or by `env + key`.

## Quality Bar

- Develop behavior with TDD where the work is not just static config or docs.
- Add tests for new command behavior and persistence behavior.
- Keep coverage at 100% for the implemented modules.
- Verify with:

```bash
npm test
npm run coverage
npm run build
```

## Preferred Extension Path

When adding commands in the future:

1. Add tests first
2. Implement domain/service logic
3. Wire command parsing last
