---
created_on: 2026-06-25 11:50
last_modified: 2026-06-25 11:50
status: current
ticket_status: open
---

# Wave 6: Fix Platform Config Deep-Merge and Overwrite Bugs

## Problem

In the legacy TypeScript configuration parser, multi-platform overrides are resolved by recursively deep-merging base configurations with matching `platformConfigs` elements. Crucially, arrays/slices (such as `symlinks`, `copies`, `binaries`, `dependencies`, and `scripts`) are appended, and maps (such as `env` and `aliases`) are recursively merged.

In the Go implementation, the platform-override resolution is implemented in `cmd/dotfiles/bootstrap.go` using a flat unmarshaling shortcut:

```go
// cmd/dotfiles/bootstrap.go
jsonBytes, err := json.Marshal(entry.Config)
if err == nil {
    _ = json.Unmarshal(jsonBytes, tc) // Overwrites the existing struct pointer!
}
```

- **The Bug**: In Go, `json.Unmarshal` onto an existing struct pointer **completely overwrites any slice/array fields** with the incoming values instead of appending or merging them.
  For example, if a tool config defines global base `symlinks`, but then defines a platform-specific setting under `platformConfigs` (such as setting an `env` variable for macOS), Go's unmarshaler will **silently delete all of the tool's base symlinks and binaries**, since the platform-specific override does not repeat them. Only the platform-specific slice is preserved.

## Why this matters

This is a silent correctness bug that breaks multi-platform tool definitions. Users who define shared binaries or symlinks with platform-specific environment variables will find their files completely unlinked, uninstalled, or ignored under the Go engine due to silent struct-overwrite behaviors.

## Observed context

- Codebase files affected:
  - `cmd/dotfiles/bootstrap.go` (contains the `ResolvePlatformConfigs` function with the raw unmarshal overwrite)
  - `pkg/config/config.go` (defines configuration structs)

## Desired outcome

The `ResolvePlatformConfigs` function is refactored to perform recursive, deep-field merging on `ToolConfig` structures, ensuring that array/slice lists are merged and appended, and string maps are combined, fully matching the TypeScript merge specification.

## Acceptance criteria

- [ ] Rewrite `ResolvePlatformConfigs` in `cmd/dotfiles/bootstrap.go` to perform deep merging instead of flat JSON unmarshaling:
  - Base fields (like `Version`, `Description`) are updated if set in the override.
  - Slices/Arrays (such as `Symlinks`, `Copies`, `Binaries`, `Dependencies`) are **appended and merged** (concatenated), preserving all base settings.
  - Maps (such as `Env`, `Aliases`, `Functions`) are **deep-merged** (keys combined, overriding base values only if keys conflict).
- [ ] Create a comprehensive Go unit test suite inside `pkg/config/platform_merge_test.go` verifying:
  - Concatenation: Base `Symlinks` and platform-override `Symlinks` are both present in the final resolved configuration.
  - Concatenation: Base `Dependencies` and platform-override `Dependencies` are correctly merged.
  - Map Merging: Conflicting keys in `Env` map are correctly overridden by the platform config, while non-conflicting keys are preserved.
  - Base Fields: Non-collection primitive fields (like `Version`) are successfully overwritten if defined in the matching platform config.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
