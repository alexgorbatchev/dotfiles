---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Implement Platform Configs Resolution in Go Orchestrator

## Problem

In TypeScript, `platformConfigs` are a core cross-platform feature allowing developers to define platform-specific or architecture-specific overrides (e.g., custom parameters, files, packages, or symlinks on macOS vs. Linux) for a tool.

The TS runtime dynamically resolves and merges these overrides using `resolvePlatformConfig` at every entry point (inside `Installer.ts`, `GeneratorOrchestrator.ts`, and `ShimGenerator.ts` / `SymlinkGenerator.ts`) before passing the tool config to installer plugins.

In Go, although `PlatformConfigs` is parsed into the `ToolConfig` struct within `pkg/config/config.go`, there is **zero implementation of resolving or merging `PlatformConfigs` anywhere in the Go codebase**. The Go orchestrator and installers directly access the base `tool.InstallParams` or `tool.InstallationMethod` without performing any resolution. As a result, cross-platform configurations will either fail to install the correct dependencies or crash during execution on target machines.

## Why this matters

The dotfiles installer is fundamentally designed to support cross-platform configurations. Without `platformConfigs` resolution, any user setup that relies on different installation managers on different platforms (e.g. using `brew` on macOS but `apt` on Linux) will break completely, preventing the Go CLI from functioning as a drop-in replacement.

## Observed context

- Go files:
  - `pkg/config/config.go` (defines `ToolConfig` and `PlatformConfigEntry` structs)
  - `pkg/orchestrator/orchestrator.go` (where configurations are processed and passed to installers)
- TS files:
  - `packages/utils/src/resolvePlatformConfig.ts` (contains original TS resolution/merging algorithm)
  - `packages/installer/src/Installer.ts` (resolves platform configs before installing)

## Desired outcome

The Go orchestrator must dynamically resolve and merge `PlatformConfigs` into the active `ToolConfig` for the running system (matching on OS, architecture, and optionally package manager/libc/shell) before any installer plugin is called, ensuring that installers operate on fully-merged, platform-correct fields.

## Acceptance criteria

- [ ] **Implement Go-native Platform Config Resolution**: Create a robust platform config resolver in Go (e.g., in `pkg/config/resolver.go` or `pkg/config/config.go`) that takes a `ToolConfig` and current `SystemInfo` and returns a copy of `ToolConfig` with all applicable platform-specific overrides deeply merged.
- [ ] **Ensure Deep-Merge Semantics**: When a platform match is found, fields like `InstallParams`, `Binaries`, `Symlinks`, `Copies`, and `SourceFiles` must be deeply merged (with platform-specific overrides taking precedence over base fields) matching the TypeScript behavior.
- [ ] **Integrate into Orchestrator Pipeline**: Invoke `ResolvePlatformConfig` inside `pkg/orchestrator/orchestrator.go` at the very beginning of the generation and installation pipelines before selecting or configuring any installer.
- [ ] **Unit testing**: Add unit tests in `pkg/config/resolver_test.go` asserting:
  - Correct matching on `linux` / `amd64` / `darwin` / `arm64`.
  - Proper deep-merging of overriding fields inside `InstallParams`.
  - Non-matching platform blocks are ignored.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
