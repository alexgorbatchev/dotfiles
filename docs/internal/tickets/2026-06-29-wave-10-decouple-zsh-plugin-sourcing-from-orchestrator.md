---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Decouple Zsh Plugin Sourcing from Orchestrator

## Problem

In TypeScript, the orchestrator retrieves shell plugin initialization commands dynamically by invoking a plugin-level `getShellInit` hook during generation.

In Go, the orchestrator (`pkg/orchestrator/orchestrator.go` lines 826-868) bypasses this abstraction entirely. Instead of querying the installer, the orchestrator hardcodes naming conventions and searches for candidates (like `pluginName + ".plugin.zsh"`, `"init.zsh"`, etc.) directly. This breaks encapsulation boundaries and prevents custom plugins or bypassed (already installed) plugins from declaring their own sourcing behaviors.

## Why this matters

The orchestrator should not possess hardcoded knowledge of specific plugin naming layout conventions. If a plugin utilizes a non-standard entry point, Go’s orchestrator fails to source it unless the user manually defines a `"source"` parameter. This design also prevents bypassed installations from being registered.

## Observed context

- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (contains hardcoded plugin file scanning checks)
  - `pkg/installer/installer.go` (defines the Go installer interface)
  - `pkg/installer/zsh_plugin.go` (implements Zsh plugin installation)

## Desired outcome

Consolidate shell initialization sourcing within the installer registry. Extend the `Installer` interface with an optional `GetShellInit` capability. The orchestrator will query this method polymorphically to fetch shell-init commands for both active and bypassed installations, completely removing hardcoded candidate loops from `orchestrator.go`.

## Acceptance criteria

- [ ] Create an optional `ShellInitializer` interface (or add a method on `Installer` interface) in `pkg/installer/installer.go` carrying `GetShellInit(toolName string, currentDir string) ([]string, error)`.
- [ ] Implement `GetShellInit` inside `pkg/installer/zsh_plugin.go` to scan directory files and return appropriate sourcing strings.
- [ ] Refactor `pkg/orchestrator/orchestrator.go` to invoke `GetShellInit` polymorphically, removing the hardcoded candidate slice check.
- [ ] Write a unit test verifying dynamic shell-init commands are loaded correctly for both active and bypassed Zsh plugins.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
