---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 1: Core Utilities and File System Abstraction

## Problem

The current TypeScript codebase implements platform detection, structured logging, path parsing, and file system interactions using Node.js/Bun globals and APIs. The lack of structured Go equivalents prevents the compilation of a portable standalone binary and limits unit testing speed and deterministic test sandboxing due to direct disk mutations.

## Why this matters

Core utilities and a mockable file system are the foundational building blocks of the rewritten Go application. High-performance structured logging, precise OS/architecture evaluation, and a fully in-memory file system are required by all higher-level packages to perform reliable, dry-run-safe operations and achieve rapid, zero-I/O test execution.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 4 and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/utils/utils.go` (implement pure functional helper functions)
  - `pkg/logger/logger.go` (implement slog-based tab-delimited formatting)
  - `pkg/logger/log_messages.go` (implement centralized log messages)
  - `pkg/arch/arch.go` (implement platform/OS and hardware CPU architecture mapping)
  - `pkg/fs/fs.go` (define the file system interface `FS`)
  - `pkg/fs/os_fs.go` (implement OS-backed `FS`)
  - `pkg/fs/mem_fs.go` (implement multi-mutex protected in-memory `FS` mock)

## Desired outcome

A set of fully tested, zero-dependency core packages under `pkg/utils`, `pkg/logger`, `pkg/arch`, and `pkg/fs` that expose clean, deterministic interfaces for platform identification, tab-separated structured logging, and mockable file system interactions.

## Acceptance criteria

- [ ] `pkg/utils` must export helper functions for slices, platform string parsing, and path resolution.
- [ ] `pkg/logger` must wrap Go's native `log/slog` and implement a tab-delimited user-facing format mapping the legacy TypeScript `tslog` output layout.
- [ ] `pkg/logger` must not write logs directly to `os.Stdout` and instead will direct them to `os.Stderr`.
- [ ] `pkg/logger/log_messages.go` must export a central `messages` definition of all logged events, ensuring no hardcoded strings in code.
- [ ] `pkg/arch` must evaluate and export the host's operating system (darwin, linux), hardware CPU architecture (amd64, arm64), and Libc type (glibc, musl) using native runtime checks.
- [ ] `pkg/fs` must define the unified `FS` interface supporting `ReadFile`, `WriteFile`, `Remove`, `Exists`, `MkdirAll`, `Create`, and `Open`.
- [ ] `pkg/fs/os_fs.go` must implement the `FS` interface wrapping the standard library `os` package.
- [ ] `pkg/fs/mem_fs.go` must implement the `FS` interface using an in-memory map protected by structured read-write locks (`sync.RWMutex`) to guarantee safe, concurrent execution.
- [ ] Every function in these packages must be tested, achieving a minimum of 90% function-level test coverage.
- [ ] All unit tests for file system actions must target `pkg/fs.MemFS` or `t.TempDir()` to guarantee that zero physical disk writes occur during tests.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
