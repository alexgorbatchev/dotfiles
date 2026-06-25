---
created_on: 2026-06-25 10:15
last_modified: 2026-06-25 10:15
status: current
ticket_status: open
---

# Wave 6: Complete Migration of All Remaining E2E Integration Tests to Go

## Problem

The repository currently relies on a hybrid execution model where Go-native E2E tests (in `tests/e2e/`) run alongside legacy TypeScript E2E tests (in `packages/e2e-test/src/__tests__/`) via `bun test` in `package.json`'s `"test:all"` command.
* **The Gap:** There are 14 legacy TS integration test files that have **not** yet been migrated to Go:
  - `ghCli.test.ts` (GitHub client credentials, authentication, and enterprise testing)
  - `completion.test.ts` (completions generation, glob resolution, and shell completion tests)
  - `env.test.ts` (virtual environments and isolated activation profile tests)
  - `symlinkStale.test.ts` (stale/orphaned symlink identification and cleanup verification)
  - `versionDetection.test.ts` (regex and command-based dynamic version checks)
  - `toolRename.test.ts` (renamed tool configs and database migration checks)
  - `pkg.test.ts` (macOS PKG installer executions and path queries)
  - `typeSafety.test.ts` (Zod schemas, input parameters, and structural contract tests)
  - `giteaRelease.test.ts` (Gitea release download, attachments, and API mocks)
  - `files.test.ts` (tracked file trees and registry queries)
  - `autoInstall.test.ts` (automatic installation during generate commands for `auto: true` tools)
  - `dnf.test.ts` (DNF package installation executions via fake dnf CLI)
  - `pacman.test.ts` (Pacman package installation executions via fake pacman CLI)
  - `hook.test.ts` (advanced install and generation hooks, including hook errors)
* **The Consequences:** If the legacy TypeScript packages (including `packages/e2e-test/`) are demolished to ship a pure Go binary (as planned in the other Wave 6 ticket), these 14 test files will be **deleted**, leaving massive critical functionalities (like virtual environments, package managers, and completion scripts) completely untested and unverified under the Go engine.

## Why this matters

Before we can safely delete the TypeScript implementation and ship the statically-linked Go binary, we must establish **100% Go-native E2E testing coverage**. Migrating the remaining 14 test files directly to `tests/e2e/` guarantees that the Go engine is 100% correct, reliable, and regression-proof, and ensures production durability when replacing the TS toolchain.

## Observed context

- Legacy E2E test files in `packages/e2e-test/src/__tests__/`.
- Extracted and closed Wave 5 E2E migration ticket `docs/internal/tickets/closed/2026-06-23-wave-5-e2e-test-suite-migration.md`.
- Active Go E2E harness in `tests/e2e/harness.go` and its existing tests.

## Desired outcome

All remaining 14 integration test suites are translated into robust, parallelized, Go-native E2E test files inside `tests/e2e/`. The legacy Bun-based testing package (`packages/e2e-test/`) is completely deleted, and `package.json`'s test commands run solely on Go-native tests:
`"test:all": "go test -count=1 ./tests/e2e/..."`
providing 100% full-suite Go coverage.

## Acceptance criteria

- [ ] Migrate `completion.test.ts` to `tests/e2e/completion_test.go`, verifying shell completions downloading, glob resolving, and copying.
- [ ] Migrate `env.test.ts` to `tests/e2e/env_test.go`, asserting virtual environment creation and sourcing.
- [ ] Migrate `symlinkStale.test.ts` to `tests/e2e/symlink_stale_test.go`, verifying stale/orphaned symlink cleanup.
- [ ] Migrate `versionDetection.test.ts` to `tests/e2e/version_detection_test.go`, verifying dynamic version lookup command matches.
- [ ] Migrate `toolRename.test.ts` to `tests/e2e/tool_rename_test.go`, verifying database migration path on renamed configurations.
- [ ] Migrate `pkg.test.ts` to `tests/e2e/pkg_test.go`, verifying macOS PKG system installation path queries.
- [ ] Migrate `giteaRelease.test.ts` to `tests/e2e/gitea_release_test.go`, asserting Gitea release attachments download.
- [ ] Migrate `files.test.ts` to `tests/e2e/files_test.go`, asserting tracked file trees.
- [ ] Migrate `autoInstall.test.ts` to `tests/e2e/auto_install_test.go`, asserting automatic generation installs.
- [ ] Migrate `dnf.test.ts` to `tests/e2e/dnf_test.go`, verifying Dnf installations.
- [ ] Migrate `pacman.test.ts` to `tests/e2e/pacman_test.go`, verifying Pacman installations.
- [ ] Migrate `ghCli.test.ts` and `hook.test.ts` to their corresponding Go tests, checking Advanced GitHub API auth and hook error cascades.
- [ ] Clean up and delete `packages/e2e-test/` directory, and update `package.json` test scripts to invoke only Go E2E tests:
  `"test:all": "go test -count=1 -p 1 ./tests/e2e/...`
- [ ] **Review Instructions:** Run an independent review pass of the changes using a dedicated review workflow or review subagent, and resolve all identified issues until a completely clean review is returned.
