# High Priority Issues — Parallelizable Task Breakdown

This file translates the **High Priority** items listed in `REVIEW-COMPLETION-SUMMARY.md` into tasks that can be implemented **in parallel** on separate branches and merged back to `main` with minimal/zero conflicts.

## Parallel Work Rules (to avoid merge conflicts)

- Each task has a **strict file ownership list**. Do not edit files outside the list.
- Prefer **adding new files** (helpers/tests) over modifying shared ones.
- If you discover a necessary change outside your file ownership list, stop and spin up a new task/branch.

## Task List

### T101 — Config: remove raw `node:fs` usage from `tsConfigLoader`

- **Branch:** `fix/config-tsConfigLoader-filesystem-abstraction`
- **Package:** `packages/config`
- **Issue:** `tsConfigLoader` uses `node:fs/promises` directly for its existence check even though it receives `IFileSystem`.
- **Clarification:** TypeScript config loading still relies on `import(userConfigPath)`, which inherently reads from the runtime’s module loader and therefore expects a real on-disk path. This task is *not* intended to make TypeScript config loading work purely from `MemFileSystem`; it only removes the direct `node:fs` call so the existence check respects the injected filesystem abstraction.
- **Files owned (edit only these):**
  - `packages/config/src/tsConfigLoader.ts`
  - `packages/config/src/__tests__/tsConfigLoader.test.ts`
  - `packages/config/src/__tests__/tsConfigLoader--context.test.ts`

**Implementation requirements**
- Replace `fs.access(userConfigPath)` with `fileSystem.exists(userConfigPath)` (or equivalent `IFileSystem` call).
- Avoid type assertions if possible (prefer runtime type-guards for `module.default`).
- Preserve existing error behavior (logging + `exitCli(1)` on fatal parse/load issues).
- Do not attempt to refactor away `import(userConfigPath)` or change the “config must be read from real FS” requirement for `.ts` configs.

**Acceptance criteria**
- No import of `node:fs/promises` remains in `tsConfigLoader.ts`.
- Existing tsConfigLoader tests pass.
- `bun test`, `bun typecheck`, `bun lint`, `bun fix` pass.

---

### T102 ✅ — Config: consolidate platform/arch mapping logic

- **Branch:** `refactor/config-platform-mapping`
- **Package:** `packages/config`
- **Issue:** platform/arch conversion and enum mapping are repeated in multiple places.
- **Files owned (edit only these):**
  - `packages/config/src/projectConfigLoader.ts`
  - `packages/config/src/__tests__/loadConfig.test.ts`
  - `packages/config/src/__tests__/loadConfig--typescript-paths.test.ts`

**Implementation requirements**
- Extract canonical mapping helpers inside `projectConfigLoader.ts` (same file) and reuse them:
  - Node platform string → config OS string
  - Node arch string → config arch string
  - Config OS/arch string → `Platform`/`Architecture` enums
- Preserve exact behavior for supported values (`macos|linux|windows` and `x86_64|arm64`) and unknown passthrough.

**Acceptance criteria**
- No behavior changes in tests (only internal refactor).
- `bun test`, `bun typecheck`, `bun lint`, `bun fix` pass.

---

### T103 — CLI: make dry-run tool-config loading format-complete

- **Branch:** `fix/cli-dry-run-tool-config-loading`
- **Package:** `packages/cli`
- **Issue:** dry-run uses `MemFileSystem`, but only copies `*.tool.ts` tool configs; other formats (e.g. YAML) are not mirrored.
- **Files owned (edit only these):**
  - `packages/cli/src/main.ts`
  - `packages/cli/src/log-messages.ts`

**Implementation requirements**
- In dry-run mode, mirror **all tool config file formats that the config loader supports** from the real tool configs directory into MemFS.
- Keep logging user-facing and short; add new templates via `packages/cli/src/log-messages.ts` only.
- Do not change command behavior beyond dry-run correctness.

**Acceptance criteria**
- Dry-run can run `generate` in a project that uses non-TS tool config files.
- No new `console.*` statements.
- `bun test`, `bun typecheck`, `bun lint`, `bun fix` pass.

---

### T104 — CLI: reduce per-command boilerplate (command action wrapper)

- **Branch:** `refactor/cli-command-action-wrapper`
- **Package:** `packages/cli`
- **Issue:** each command repeats the same patterns (merge global opts, call servicesFactory, try/catch, exitCli).
- **Files owned (edit only these):**
  - Add: `packages/cli/src/createCommandAction.ts`
  - `packages/cli/src/generateCommand.ts`
  - `packages/cli/src/installCommand.ts`
  - `packages/cli/src/cleanupCommand.ts`

**Implementation requirements**
- Implement a small helper (in `createCommandAction.ts`) that standardizes:
  - combining `program.opts()` with command options
  - consistent try/catch handling
  - returning an exit code and calling `exitCli` in one place
- Refactor only the 3 commands listed above to use the helper.
- Do not touch other command files to avoid conflicts.

**Acceptance criteria**
- The three commands keep their current flags and behavior.
- `bun test packages/cli/src/__tests__` passes.
- `bun typecheck`, `bun lint`, `bun fix`, `bun test` pass.

---

### T105 — CLI: start shrinking `IServices` coupling (command-local slices)

- **Branch:** `refactor/cli-services-slices`
- **Package:** `packages/cli`
- **Issue:** `IServices` is a broad “god object”, making commands and tests depend on unrelated services.
- **Goal (incremental):** reduce coupling **without** changing runtime wiring yet.
- **Files owned (edit only these):**
  - `packages/cli/src/types.ts`
  - `packages/cli/src/__tests__/createCliTestSetup.test.ts`
  - `packages/cli/src/installCommand.ts`
  - `packages/cli/src/__tests__/installCommand.test.ts` (if it exists; otherwise add it)

**Implementation requirements**
- Introduce command-specific service slice types (e.g. `IInstallServices`) derived from `IServices`.
- Update `installCommand` to depend on the narrower slice type internally (even if `servicesFactory` still returns `IServices`).
- Update tests to mock only the needed slice.

**Acceptance criteria**
- `installCommand` no longer requires constructing a full `IServices` mock in tests.
- No behavior changes.
- `bun test packages/cli/src/__tests__` passes.

---

## Suggested Merge Order (minimize risk)

1. T101 + T102 (config-only tasks; independent)
2. T103 (cli dry-run fix)
3. T104 + T105 (cli refactors; independent of config changes)

## Local Verification Commands (per branch)

- `bun fix`
- `bun lint`
- `bun typecheck`
- `bun test`
