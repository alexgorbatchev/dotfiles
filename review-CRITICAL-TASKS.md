# Critical Issues — Parallelizable Task Breakdown

This file translates findings from `review-CRITICAL.md` into independent tasks designed to be implemented **in parallel** on separate branches and merged back to `main` with minimal/zero conflicts.

## Parallel Work Rules (to avoid merge conflicts)

- Each task has an **explicit file ownership list**. Do not edit files outside the list.
- Prefer **adding new files** (new test files, new helpers) over editing existing shared files.
- If a task must touch a shared file unexpectedly, stop and split the task into a new branch/task.
- Use branch names exactly as suggested.

## Task List

### T001 — Harden archive extraction (shell injection + temp dir uniqueness)

- **Branch:** `fix/archive-extractor-command-safety`
- **Package:** `packages/archive-extractor`
- **Why:** `ArchiveExtractor` uses `child_process.exec` with interpolated command strings and a low-entropy temp dir suffix.
- **Files owned (edit only these):**
  - `packages/archive-extractor/src/ArchiveExtractor.ts`
  - `packages/archive-extractor/src/__tests__/ArchiveExtractor.test.ts`
  - (optional) `packages/archive-extractor/src/IArchiveExtractor.ts` (only if the public contract must change)
  - (optional) `packages/archive-extractor/src/index.ts` (only if exports change)

**Implementation requirements**
- Replace shell-string execution with a **non-shell** execution strategy:
  - Preferred: Bun `$` with argument interpolation (no string concatenation), OR
  - Alternative: `execFile` / `spawn` with args array.
- Eliminate the quoting/escaping approach for `tar`/`unzip` commands (paths must never be injected into a shell command string).
- Replace `Math.random() * 10000` temp directory suffix with `randomUUID()` (or equivalent strong uniqueness).
- Keep behavior compatible:
  - Supported formats remain `tar(.gz|.bz2|.xz)` and `zip`.
  - Extraction still occurs into a temp directory under `targetDir` and then files are moved.

**Acceptance criteria**
- No `child_process.exec` used for tar/unzip extraction.
- No command strings constructed via string concatenation/interpolation for tar/unzip.
- Temp directory names are collision-resistant.
- `bun test packages/archive-extractor/src/__tests__/ArchiveExtractor.test.ts` passes.
- `bun typecheck`, `bun lint`, `bun fix`, and `bun test` pass.

**Status:** ✅ Completed on 2025-12-29

---

### T002 — Deduplicate `cleanupTempFiles` in build package ✅ COMPLETED

- **Branch:** `refactor/build-cleanupTempFiles-dedup` (merged)
- **Package:** `packages/build`
- **Why:** Two identical implementations exist and can diverge.
- **Solution Implemented:**
  - Deleted `packages/build/src/build/helpers/cleanupTempFiles.ts`
  - Kept canonical implementation in `packages/build/src/build/steps/cleanupTempFiles.ts`
  - No changes needed to `build.ts` or public API
  - All tests pass (1128 pass, 0 fail)

**Status:** ✅ Merged to main on 2025-12-21

---

### T003 — Build tests: runtime dependency resolution ✅ COMPLETED

- **Branch:** `feature/2025-12-21/build-test-coverage`
- **Package:** `packages/build`
- **Why:** Minimal coverage around dependency discovery/version logic.
- **Files added:**
  - `packages/build/src/build/__tests__/resolveRuntimeDependencies.test.ts` (2 test cases)
  - `packages/build/src/build/__tests__/helpers/createMockBuildContext.ts`
  - `packages/build/src/build/__tests__/helpers/manageTmpDir.ts`

**Solution Implemented:**
  - Created test file with 2 focused tests (context structure, file I/O)
  - Removed fixture-only tests as per code quality standards
  - All tests pass deterministically

**Status:** ✅ Completed on 2025-12-21

---

### T004 — Build tests: CLI bundle size enforcement ✅ COMPLETED

- **Branch:** `feature/2025-12-21/build-test-coverage`
- **Package:** `packages/build`
- **Why:** Guardrail logic should be covered to prevent regressions.
- **Files added:**
  - `packages/build/src/build/__tests__/enforceCliBundleSizeLimit.test.ts` (6 test cases)
  - `packages/build/src/build/__tests__/fixtures/fixtures--bundle-size.ts`

**Solution Implemented:**
  - Created test file with 6 comprehensive tests covering:
    - Under/over limit scenarios
    - Boundary conditions (exactly at limit)
    - Error messages with helpful context
    - Non-existent file handling

**Status:** ✅ Completed on 2025-12-21

---

### T005 — Build tests: dist `package.json` generation ✅ COMPLETED

- **Branch:** `feature/2025-12-21/build-test-coverage`
- **Package:** `packages/build`
- **Why:** The publishable artifact shape is a high-risk regression area.
- **Files added:**
  - `packages/build/src/build/__tests__/generateDistPackageJson.test.ts` (10 test cases)
  - `packages/build/src/build/__tests__/fixtures/fixtures--dist-package-json.ts`

**Solution Implemented:**
  - Created test file with 10 focused tests covering:
    - Valid JSON generation
    - Required fields presence (name, version, bin, types, exports, files)
    - Correct dependency inclusion (runtime + type deps)
    - Proper formatting and structure

**Status:** ✅ Completed on 2025-12-21

---

## Suggested Merge Order (should be conflict-free in any order)

1. T001 (archive-extractor hardening) — ✅ **COMPLETED**
2. T002 (build dedup) — ✅ **MERGED**
3. T003–T005 (build tests) — ✅ **COMPLETED** (ready for merge)

## Local Verification Commands (per branch)

- `bun fix`
- `bun lint`
- `bun typecheck`
- `bun test`
