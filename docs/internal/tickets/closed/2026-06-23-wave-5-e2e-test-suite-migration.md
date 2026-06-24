---
created_on: 2026-06-23 12:00
last_modified: 2026-06-23 18:00
status: current
ticket_status: closed
---

# Wave 5: Go-Native End-to-End Test Suite Migration

## Problem

The legacy repository uses a Bun-based end-to-end (E2E) testing framework under `packages/e2e-test/` to verify CLI command workflows, shell initializations, shims, environment emissions, and installer plugins. As part of the Go 1.26 migration plan, once the CLI commands and installer plugins are fully migrated, we need to translate these integration tests into a native Go testing suite.

Without a native Go E2E test suite, the project is forced to maintain a Node/Bun execution wrapper and runtime dependency solely for testing, preventing a clean transition to a single standalone compiled binary and carrying a high risk of hidden CLI regressions.

## Why this matters

End-to-end tests provide the ultimate real-world safety net by checking system side-effects, filesystem directories, database states, and shell configurations in true execution scenarios. Migrating this suite to Go-native testing guarantees full standalone self-sufficiency of the compiled executable, eliminates Node/Bun dependencies, and ensures high-confidence release validation without platform-specific issues.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 11 (Tier 9) and Section 12 (Go-Native E2E Test Suite Migration).
- Legacy TypeScript implementation: `packages/e2e-test/src/__tests__/`.
- Codebase files affected:
  - `tests/e2e/harness.go` (implement the Go-native E2E test harness)
  - `tests/e2e/generate_test.go` (migrate generate command and stale symlink tests)
  - `tests/e2e/install_test.go` (migrate install command, package managers, and hook tests)
  - `tests/e2e/trace_test.go` (migrate logging and `--trace` configuration tests)
  - `tests/e2e/update_test.go` (migrate update command tests)
  - `tests/e2e/dependency_test.go` (migrate dependency sorting tests)
  - `tests/e2e/conflict_test.go` (migrate conflict detection tests)

## Desired outcome

A highly robust, parallelizable, and isolated Go E2E test suite located in `tests/e2e/` that compiles and runs the Go CLI binary (`.dist/dotfiles`), spins up local mock servers, constructs clean sandboxes using standard Go test constructs, and verifies every critical CLI command and output artifact.

## Acceptance criteria

- [x] Implement `tests/e2e/harness.go` defining a reusable `TestHarness` struct conforming exactly to the structural interface and all 15 method signatures specified in Section 12, Subsection 2 of `docs/internal/eng-designs/go-migration-plan.md`.
- [x] Implement dynamic compiled binary discovery inside `tests/e2e/harness.go` that locates the executable at `.dist/dotfiles` or dynamically compiles it under `t.TempDir()` during initialization.
- [x] Each E2E test in the suite must utilize `t.TempDir()` to construct a guaranteed isolated sandbox workspace for config, binary, and shell files, and execute with parallel safety using `t.Parallel()`.
- [x] The harness must explicitly override environment variables, specifically including `HOME`, `XDG_CONFIG_HOME`, and any stateful environment variables, to point inside the `t.TempDir()` sandbox to prevent global user environment mutation.
- [x] Incorporate local mock HTTP servers inside E2E tests using `net/http/httptest` simulating GitHub API endpoints (`/repos/...`), Gitea releases, and serving mock binary test assets (`.tar.gz` and `.zip` archives) without external network access.
- [x] Migrate `generate` command tests in `tests/e2e/generate_test.go` asserting correct output for shims, exports, aliases, always scripts, once scripts, completions, and stale symlink removal.
- [x] Migrate `install` command and hook tests in `tests/e2e/install_test.go` asserting installer plugin execution, fake package managers (apt/dnf/pacman), state registry SQLite updates, and pre/post-install hook execution (validating stdout/stderr logging formatting and prefixes).
- [x] Migrate `trace` and logging configuration tests in `tests/e2e/trace_test.go` asserting that `--trace` displays correct `.go:line` locations in warning/info logs, default execution hides file locations, and `--quiet` fully suppresses output.
- [x] Migrate `update` command tests in `tests/e2e/update_test.go` asserting semver checks, local/remote version comparison, and upgrade triggers.
- [x] Migrate dependency sorting tests in `tests/e2e/dependency_test.go` asserting binary-to-tool topological sorting, ambiguous binary provider errors, and missing binary errors.
- [x] Migrate conflict detection tests in `tests/e2e/conflict_test.go` asserting accurate detection of pre-existing files, unmanaged shims, and bin name collisions.
- [x] All migrated E2E tests must execute and pass cleanly when running `go test ./tests/e2e/...`.
- [x] Integrate the Go E2E suite execution command (`go test ./tests/e2e/...`) into the root `package.json` scripts (`"test:all"`, `"test:native"`, `"check"`, `"check:ci"`) so they execute as part of local and CI checks.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
