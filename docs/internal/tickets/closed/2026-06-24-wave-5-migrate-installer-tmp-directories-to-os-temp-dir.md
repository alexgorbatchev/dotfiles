---
created_on: 2026-06-24 20:45
last_modified: 2026-06-24 21:00
status: current
ticket_status: closed
---

# Wave 5: Migrate Hardcoded /tmp Fallbacks in Go Installers to os.TempDir()

## Problem

Several Go installer plugins inside `pkg/installer/` contain hardcoded fallbacks to the global Unix directory `"/tmp"` when their destination or binary directory configuration is empty:

- `curl_tar.go` (line 59)
- `curl_script.go` (line 56)
- `curl_binary.go` (line 55)
- `manual.go` (line 55)
- `pkg.go` (line 96)
- `github.go` (line 137)
- `gitea.go` (line 126)
- `dmg.go` (line 97)
- `zsh_plugin.go` (line 75)

This hardcoded fallback violates the repository's strict local sandboxing guidelines:

- **The Guideline:** "Use .tmp in the project folder instead of global /tmp."
- **The Consequence:** During local test execution, any installer falling back to `"/tmp"` writes file states directly to the host's global `/tmp` directory instead of the isolated project-root `.tmp/` folder, causing filesystem pollution and failing validation checkers.

## Why this matters

Replacing hardcoded Unix `"/tmp"` strings with Go's native `os.TempDir()` ensures perfect alignment with host-level environment overrides (`TMPDIR`). During test and CI runs (where `TMPDIR` is configured to `.tmp/` in the project root), installers will cleanly isolate all temporary downloads inside `.tmp/`, satisfying local sandboxing policies while maintaining cross-platform compatibility on Windows and macOS.

## Observed context

- Specified in the root `AGENTS.md` Setup and Gotchas ("Use .tmp in the project folder instead of global /tmp").
- Codebase files affected:
  - `pkg/installer/curl_tar.go`
  - `pkg/installer/curl_script.go`
  - `pkg/installer/curl_binary.go`
  - `pkg/installer/manual.go`
  - `pkg/installer/pkg.go`
  - `pkg/installer/github.go`
  - `pkg/installer/gitea.go`
  - `pkg/installer/dmg.go`
  - `pkg/installer/zsh_plugin.go`

## Desired outcome

Go installer plugins natively leverage `os.TempDir()` as their default fallback target, ensuring that temporary file activities are confined to the project's sandbox directory during test runs.

## Acceptance criteria

- [x] Replace all occurrences of hardcoded `"/tmp"` default folder fallbacks inside the 9 identified Go installer files with `os.TempDir()`.
- [x] Ensure that `os` package is imported correctly inside each modified file.
- [x] Run `go test ./pkg/installer/...` and `bun check:ci` to verify all test suites and parity checks pass completely under the sandboxed environment.
- [x] **Review Instructions:** Run an independent review pass of the changes using a dedicated review workflow or review subagent, and resolve all identified issues until a completely clean review is returned.
