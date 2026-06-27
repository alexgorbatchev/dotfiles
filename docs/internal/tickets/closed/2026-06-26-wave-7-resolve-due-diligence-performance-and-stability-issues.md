---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Resolve Due Diligence Performance and Stability Issues

## Problem

A strict holistic audit of the Go-native codebase has uncovered four stability and performance issues that violate clean-code standards and production safety:

1. **Go Once-Script Startup Errors**: Once-scripts self-delete on execution, but their hardcoded `source` statements inside shell profile initializers remain, printing noisy "file not found" errors on every subsequent shell startup.
2. **In-Memory Buffering Performance Hazard (Potential OOM)**: `pkg/archive/archive.go` reads archive files into memory using `io.ReadAll` instead of streaming them with `io.Copy`, risking Out-Of-Memory crashes on large binary downloads.
3. **Loss of Symlinks during Go Extraction**: Go's manual archive extractor ignores symbolic link headers inside tar/zip files, breaking unpacked toolchains (such as Node or Bun) that depend on internal symlinks.
4. **Sudo Interactive Hang Risk**: Spawning `sudo` commands in non-interactive CI/CD environments hangs Go execution indefinitely on password prompts.

## Why this matters

These represent stability and performance defects. In-memory buffering can crash the engine on low-memory servers, and ignoring archive symlinks breaks critical runtime installations like Node.js. Quiet terminal startups are essential for preventing environment noise.

## Observed context

- Go codebase:
  - `pkg/archive/archive.go` (OOM buffering and symlink omission)
  - `pkg/orchestrator/orchestrator.go` (once-script shell injection)
  - `pkg/exec/os_runner.go` (sudo executions)

## Desired outcome

The Go-native engine's core extractors and command execution runners are fully hardened, resolving all performance hazards, terminal startup errors, and OOM vulnerabilities.

## Acceptance criteria

- [x] **Fix Once-Script Errors**: Replace hardcoded `source` commands in shell profile initializers with dynamic glob checks or conditional presence wrappers to prevent "file not found" errors.
- [x] **Stream Archive Extraction**: Replace `io.ReadAll` with chunked buffer streams utilizing `io.Copy` inside `pkg/archive/archive.go` to eliminate high memory footprints during extraction.
- [x] **Restore Symlinks during Extraction**: Update the archive parser to correctly evaluate and recreate symbolic link headers (`tar.TypeSymlink`).
- [x] **CI/CD Sudo Guard**: Guard `sudo` execution paths; if a non-interactive CI/CD environment is detected, throw a prompt validation error instead of hanging on terminal inputs.
- [x] **Unit Testing**: Add tests inside `pkg/archive/archive_test.go` and `pkg/exec/exec_test.go` verifying streaming safety, symlink restoration, and interactive guards.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
