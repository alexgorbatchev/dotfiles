# Instructions for Generating the Go CLI Migration Gap Report

You are tasked with producing a comprehensive, technical, and fact-backed gap report that documents the exact migration status of our Go CLI codebase and its parity with the legacy TypeScript (TS) implementation. 

You must write the final compiled report directly to `./gaps-report.md` in the project root.

---

## 🎯 Task Objective

Evaluate the monorepo to list completed features, identify unmigrated test suites, and outline the remaining backlog of Wave 6 tickets. This report is the source of truth that will guide developers to safely delete the TypeScript implementation (`packages/`) and transition to a pure statically-linked Go binary distribution.

---

## 📋 Step-by-Step Execution Plan

Follow these exact steps to compile the required facts and draft the report:

### Step 1: Verify Core Command & Database Parity
1. Run `bun check:ci` to execute the dual-run verification harness (`scripts/parity-harness/main.go`).
2. Verify that the harness returns a successful matching state:
   `🎉 PARITY SUCCESS! Legacy TS and compiled Go outputs are identical.`
3. Verify that the following Wave 5 core features are fully implemented, merged, and passing:
   - **Refactored Generate Semantics:** Standalone generation of shims/symlinks for standard tools, keeping `db_tool_installations.json` completely empty (`[]`) on dry-runs.
   - **TrackedFileSystem (`pkg/fs/tracked_fs.go`):** Implicit sqlite recording of writes, permissions, and directory creations during installer sessions.
   - **Decimal Permission Representation:** Storage of file permissions as stringified base-10 integers (e.g. `"493"` / `"420"`) to prevent database representation mismatches between Go and TS.
   - **Once-Script Self-Deletion:** Shell-appropriate self-cleanup tokens appended to once-scripts (e.g., `${BASH_SOURCE[0]}` for bash, `${(%):-%x}` for zsh, and `Remove-Item` for PowerShell).
   - **SupportsSudo Validation:** Orchestrator-level privilege check aborting fast if a user attempts to run a non-sudo installer (e.g., `npm`, `cargo`) under sudo.
   - **Dynamic fsys Injection:** Passing of context-aware tracked file systems (`activeFS`) to installer plugins prior to execution.
   - **Atomic UUID Staging Promotion:** Creating temporary, uniquely-named staging subdirectories (e.g. `binaries/<tool>/<uuid>`) for all non-external tool installations and atomically promoting them to `/current` via directory renames upon completion.

### Step 2: Audit the E2E Integration Test Suite Gaps
Compare the legacy TypeScript E2E test files with the newly written Go-native test files:
1. Scan the legacy TS tests under:
   `packages/e2e-test/src/__tests__/`
2. Scan the Go E2E tests under:
   `tests/e2e/`
3. Map and list every single TS E2E test file that has **not** yet been migrated to a Go test file (e.g., `ghCli.test.ts`, `env.test.ts`, `completion.test.ts`, `pkg.test.ts`, `giteaRelease.test.ts`, `files.test.ts`, `autoInstall.test.ts`, `dnf.test.ts`, `pacman.test.ts`, etc.).
4. Describe the **consequences** of this test gap: if TS packages are demolished, we will delete these TS files and have **zero test coverage** for those critical features in the Go engine.

### Step 3: Audit the Remaining Backlog (Wave 6)
Review the active, open Wave 6 tickets inside `docs/internal/tickets/` to list what work remains:
- **`2026-06-25-wave-6-complete-remaining-e2e-integration-test-suite-migration.md`** (translating the remaining 14 E2E integration test files to Go).
- **`2026-06-25-wave-6-pure-go-binary-distribution-and-ts-demolition.md`** (separating types, implementing the Go-native dashboard REST server, build pipeline restructuring, and deleting the legacy TS `packages/` directory).

---

## ✍️ Report Output Format

Write your finalized findings directly to `./gaps-report.md` using the following exact structure:

```markdown
# Go CLI Migration: Comprehensive Parity and Gap Report

## 1. Executive Summary
- Current Monorepo State (Hybrid TS-Go implementation)
- Factual Overall Parity Score (out of 10)
- Parity Harness Verification Status (`bun check:ci` result)

## 2. Completed Milestones (Closed Wave 5 Tickets)
- Summarize the completion of generate semantics, tracked filesystem, permission format, once-script self-deletion, supports-sudo checks, fsys injection, and UUID staging.

## 3. The Test Coverage Gap (Unmigrated E2E Tests)
- List the **14 legacy TypeScript integration test files** that remain unmigrated.
- Document why this gap represents a blocker to TS demolition (loss of test coverage for virtual environments, package managers, and completion scripts on host systems).
- Map each legacy TS test file to its target Go E2E test counterpart.

## 4. Remaining Backlog (Open Wave 6 Tickets)
- **Complete Migration of All Remaining E2E Integration Tests to Go**
- **Transition to Pure Go Binary Distribution and TS Packages Demolition**
  - Subtask: Types separation and public autocomplete completeness.
  - Subtask: Go-native dashboard REST server implementation.
  - Subtask: Build pipeline restructuring.
  - Subtask: Legacy TS packages demolition.

## 5. Absolute Parity Roadmap
- Provide a step-by-step execution roadmap to safely complete the test migration, demolish TypeScript, and ship the statically compiled Go binary.
```
