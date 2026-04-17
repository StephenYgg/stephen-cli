# Extend Ak Fixed Envs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `stephen-cli ak` to support the built-in env values `gitee`, `github`, and `gitlab` without introducing a separately managed env resource.

**Architecture:** Keep the current fixed-enum model for `ak.env` and update the type, schema validation, command documentation, and tests consistently. Avoid schema or storage redesign so the change remains a narrow extension of the current command contract.

**Tech Stack:** TypeScript, Zod, Commander, Vitest

---

### Task 1: Add Failing Tests For New Built-In Env Values

**Files:**
- Modify: `tests/ak/schema.test.ts`
- Modify: `tests/cli/ak-command.test.ts`
- Modify: `tests/scaffolding/documentation.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that:
- parse `gitee`, `github`, and `gitlab` as valid env values
- allow `stephen-cli ak add -e github ...`
- require the docs to mention the new env values

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ak/schema.test.ts tests/cli/ak-command.test.ts tests/scaffolding/documentation.test.ts`
Expected: FAIL because the enum and docs still mention only the original four env values.

- [ ] **Step 3: Write minimal implementation**

Update the fixed env list and the user-facing docs so the new values become valid everywhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ak/schema.test.ts tests/cli/ak-command.test.ts tests/scaffolding/documentation.test.ts`
Expected: PASS.

### Task 2: Update The Fixed Env Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/2026-04-16-ak-command-design.md`

- [ ] **Step 1: Write the failing documentation expectation**

Use the documentation tests from Task 1 to require the new env values in the docs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scaffolding/documentation.test.ts`
Expected: FAIL because the docs do not mention `gitee`, `github`, and `gitlab`.

- [ ] **Step 3: Write minimal documentation updates**

Document that:
- `env` stays a fixed enum for now
- the supported values now include `gitee`, `github`, and `gitlab`
- env is still part of `ak`, not a separately managed sub-resource

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scaffolding/documentation.test.ts`
Expected: PASS.

### Task 3: Run Full Verification

**Files:**
- Modify: any touched files from Tasks 1-2 if verification reveals issues

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS with all tests green.

- [ ] **Step 2: Run coverage**

Run: `npm run coverage`
Expected: PASS with full statement, branch, function, and line coverage.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: PASS and emit `dist/`.

- [ ] **Step 4: Review the working tree**

Run: `git status --short`
Expected: only the intended env-extension files are modified.
