# Stephen CLI Bootstrap And Ak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the `stephen-cli` TypeScript project and implement the `ak` command with encrypted local storage, JSON/table output, and comprehensive unit coverage.

**Architecture:** Use a layered CLI architecture with command parsing at the edge, pure domain logic in the middle, and infrastructure adapters for SQLite, crypto, and rendering. Keep agent-facing behavior stable by making JSON the default output contract and using dependency injection to keep the command layer easy to test.

**Tech Stack:** TypeScript, Node.js, Commander, Zod, better-sqlite3, table, Vitest, c8, tsup

---

### Task 1: Bootstrap Project Metadata And Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.npmrc`

- [ ] **Step 1: Write the failing project-structure smoke test**

```ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

describe('project scaffolding', () => {
  it('includes required metadata files', () => {
    expect(existsSync('package.json')).toBe(true);
    expect(existsSync('tsconfig.json')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scaffolding/project-structure.test.ts`
Expected: FAIL because `package.json` and `tsconfig.json` do not exist yet.

- [ ] **Step 3: Add minimal project tooling files**

Create a Node package with:

```json
{
  "name": "stephen-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "stephen-cli": "./dist/index.js"
  }
}
```

Add TypeScript strict mode, tsup build config, ignore runtime data and coverage outputs, and pin npm behavior with `save-exact=true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scaffolding/project-structure.test.ts`
Expected: PASS.

### Task 2: Add Core Documentation And Agent Guides

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Modify: `docs/2026-04-16-ak-command-design.md`

- [ ] **Step 1: Write the failing documentation smoke test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('documentation', () => {
  it('describes stephen-cli and ak command conventions', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('stephen-cli');
    expect(readme).toContain('ak');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scaffolding/documentation.test.ts`
Expected: FAIL because the docs are not present yet.

- [ ] **Step 3: Add the docs**

Document:
- project purpose and architecture
- command philosophy and output contracts
- coding standards, testing expectations, and agent-specific rules

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scaffolding/documentation.test.ts`
Expected: PASS.

### Task 3: Implement Domain Model And Validation

**Files:**
- Create: `src/ak/types.ts`
- Create: `src/ak/schema.ts`
- Create: `src/ak/mask.ts`
- Test: `tests/ak/schema.test.ts`

- [ ] **Step 1: Write failing domain tests**

Cover:
- valid `env` values
- invalid `env` rejection
- `key` trimming and case preservation
- key masking behavior
- field-list parsing for query fields

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/schema.test.ts`
Expected: FAIL because the domain modules do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:
- shared types
- Zod schemas for input validation
- key normalization
- key masking helpers

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/schema.test.ts`
Expected: PASS.

### Task 4: Implement Hashing, Prefix Indexing, And Encryption Utilities

**Files:**
- Create: `src/ak/crypto.ts`
- Test: `tests/ak/crypto.test.ts`

- [ ] **Step 1: Write failing crypto tests**

Cover:
- `sha1(key)` id generation
- fixed-length key prefix derivation
- encrypt/decrypt roundtrip
- decrypt failure on malformed payload

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/crypto.test.ts`
Expected: FAIL because the crypto module does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:
- SHA-1 id generation
- prefix index derivation with length `12`
- AES-GCM encryption/decryption using a provided master key

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/crypto.test.ts`
Expected: PASS.

### Task 5: Implement Repository Layer

**Files:**
- Create: `src/ak/repository.ts`
- Create: `src/ak/database.ts`
- Test: `tests/ak/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Cover:
- insert record
- reject duplicate `id`
- lookup by `id`
- lookup by `env + key`
- list by env
- fuzzy list on metadata fields
- prefix search on `key`
- update mutable fields
- reject key mutation
- delete by `id`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/repository.test.ts`
Expected: FAIL because the repository layer does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:
- SQLite bootstrap
- prepared statements
- query builder for exact and fuzzy filters
- duplicate and not-found error mapping

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/repository.test.ts`
Expected: PASS.

### Task 6: Implement Output Rendering

**Files:**
- Create: `src/ak/output.ts`
- Test: `tests/ak/output.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Cover:
- JSON success output
- JSON error output
- masked table output
- raw-key table output

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/output.test.ts`
Expected: FAIL because the renderer module does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:
- JSON serializer helpers
- table serializer using `table`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/output.test.ts`
Expected: PASS.

### Task 7: Implement Use Cases And Command Handlers

**Files:**
- Create: `src/ak/service.ts`
- Create: `src/ak/command.ts`
- Create: `src/index.ts`
- Test: `tests/ak/service.test.ts`
- Test: `tests/cli/ak-command.test.ts`

- [ ] **Step 1: Write failing service and command tests**

Cover:
- add/get/list/update/delete behaviors
- `--raw-key` handling
- `-t` output shortcut
- `--field` parsing
- validation failures
- `--yes` delete behavior

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/service.test.ts tests/cli/ak-command.test.ts`
Expected: FAIL because service and command modules do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:
- service orchestration
- Commander wiring
- dependency injection for repository and output
- consistent exit-code mapping

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/service.test.ts tests/cli/ak-command.test.ts`
Expected: PASS.

### Task 8: Add End-To-End Project Verification

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/cli/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Cover:
- CLI bootstraps
- `ak` command group exists
- help text renders

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/smoke.test.ts`
Expected: FAIL because the CLI entrypoint is not fully wired yet.

- [ ] **Step 3: Write the minimal implementation**

Add:
- final test scripts
- coverage scripts
- smoke-level assertions

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli/smoke.test.ts`
Expected: PASS.

### Task 9: Run Full Verification

**Files:**
- Modify: any files needed after verification feedback

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS with all test files green.

- [ ] **Step 2: Run coverage**

Run: `npm run coverage`
Expected: PASS with full statement, branch, function, and line coverage for the implemented modules.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: PASS and emit `dist/`.

- [ ] **Step 4: Review the git diff**

Run: `git status --short`
Expected: only intended project files are modified or added.
