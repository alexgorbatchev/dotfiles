# Task: Completions Glob Support & Registry Tracking

## Context

- `rg` tool now installs into versioned directories (e.g. `.generated/binaries/rg/15.1.0/...`).
- Zsh completion is wired via:
  - `test-project/tools/rg.tool.ts`: `shell.completions('*/complete/_rg')`
  - `packages/installer/src/utils/setupCompletions.ts`: resolves `source` using minimatch and symlinks into `shellScriptsDir`.
- Symlink on disk is correct:
  - `test-project/.generated/shell-scripts/zsh/completions/_rg -> .../binaries/rg/15.1.0/.../complete/_rg`
- `bun cli --config=test-project/config.ts files --tool rg` currently only shows shim + install-dir operations, not the completion symlink.

## Goals

1. **Ensure completion symlinks are fully tracked in the file registry**
   - Completion symlink operations should be recorded with:
     - `toolName = 'rg'`
     - `fileType = 'completion'`
     - `operationType = 'symlink'`
   - `bun cli ... files --tool rg --type completion` should list the completion symlink and its target.

2. **Keep glob-based completion resolution stable**
   - `source` paths support minimatch-based globs (e.g. `"*/complete/_rg"`).
   - `setupCompletions` should resolve the correct file under versioned archive directories (e.g. `ripgrep-15.1.0-*/complete/_rg`).
   - Unit tests in `packages/installer/src/utils/__tests__/setupCompletions.test.ts` must continue to cover:
     - simple `source` paths
     - globbed `source` paths

## Current Implementation Notes

- `setupCompletions`:
  - Uses `resolveSourcePath(...)` to handle glob patterns via `minimatch` over a recursive `getAllFiles` walk.
  - Creates the symlink via `fs.symlink(...)` using the tool-scoped filesystem passed in (`toolFs`).
- `TrackedFileSystem`:
  - `symlink(...)` now records operations with `fileType = context.fileType` (previously hardcoded `'symlink'`).
  - New helper `withFileType(fileType)` added, parallel to `withToolName(toolName)`.
- **Open question**: `setupCompletions` is currently called with `toolFs` created via `createToolFileSystem(this.fs, toolName)`, but does **not** yet explicitly scope `fileType` to `'completion'`.

## Tasks

1. **Scope TrackedFileSystem for completions**
   - In `setupCompletions` (or at its call site), ensure the filesystem used for `ensureDir`, `rm`, and `symlink` is a `TrackedFileSystem` with:
     - `toolName` set to the tool being installed.
     - `fileType` set to `'completion'`.
   - Preferred approach: when the incoming `fs` is a `TrackedFileSystem`, derive a `completionFs = fs.withFileType('completion')` and use that for write/symlink operations.

2. **Verify registry contents directly**
   - After installing `rg` via:
     - `bun cli --config=test-project/config.ts install rg`
   - Inspect the registry DB under `test-project/.generated` (actual filename may differ) and confirm:
     - There is at least one row for `toolName = 'rg'` with `fileType = 'completion'` and `operationType = 'symlink'`.

3. **Align `files` command output**
   - Confirm `packages/cli/src/filesCommand.ts` and file registry query logic use `fileType = 'completion'` consistently.
   - Ensure `--type completion` and `--tool rg` together filter down to the completion symlink operation.
   - Manually validate via:
     - `bun cli --config=test-project/config.ts files --tool rg --type completion`

4. **Add/adjust tests**
   - **Registry-level test** in `packages/registry/src/file/__tests__/TrackedFileSystem.test.ts` to assert that:
     - `withFileType('completion')` + `symlink(...)` writes an operation with `fileType = 'completion'`.
   - **CLI-level or integration test** (if appropriate) to verify that for a tool with a `source` completion:
     - Installing the tool records at least one `completion`-typed file operation for that tool.

5. **Clean up and re-run full suite**
   - Run:
     - `bun test`
     - `bun lint`
   - Confirm only the known pre-existing failures remain (currently 2 tests), and no new lints are introduced.

## Acceptance Criteria

- `rg` installation uses versioned directory (`15.1.0`) and globbed completion source path.
- `test-project/.generated/shell-scripts/zsh/completions/_rg` exists and points to the correct versioned completion file.
- Registry DB contains `completion`-typed symlink records for `rg`.
- `bun cli --config=test-project/config.ts files --tool rg --type completion` prints at least one completion entry.
- All new/updated tests pass; global test run remains at 995 pass / 2 skip / 2 fail (pre-existing).
