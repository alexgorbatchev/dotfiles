---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Fix Zsh compinit Performance and Shell Wrapper Function

## Problem

Two performance and capability bugs exist inside the Go shell initialization generator:

1. **Unconditional `compinit` startup drain**: In `pkg/shellinit/shellinit.go` (line 182), Go's generator unconditionally appends the Zsh compinit reinitialization command:
   ```go
   return fmt.Sprintf("typeset -U fpath\nfpath=(%q $fpath)\nautoload -Uz compinit && compinit -u", completionsDir)
   ```
   This triggers an expensive disk-scan on every single shell spawn, resulting in severe startup latency and printing noisy security warnings in nested or non-owner shells. TS unique-prepends the completions directory to `fpath` but omits the `compinit` reinitialization.
2. **Missing CLI Wrapper Function**: The legacy TS generator automatically emits a native `dotfiles()` shell function in the main shell emission script to wrap the CLI path and automatically append the configuration path `--config` flag. Go completely omits generating this wrapper function.

## Why this matters

Shell startups must be silent and ultra-fast. Unconditional `compinit` calls violate this by introducing up to several hundred milliseconds of blocking latency on slow disks. Generating the CLI wrapper function is necessary so users can invoke `dotfiles` directly without manually adding the compiled binary path to their environment `$PATH`.

## Observed context

- Go files:
  - `pkg/shellinit/shellinit.go` (Zsh compinit insertion)
  - `pkg/orchestrator/orchestrator.go` (shell script generation)
- TS files:
  - `.workspaces/main/packages/shell-init-generator/src/formatters/ZshEmissionFormatter.ts` (Zsh completions emission)
  - `.workspaces/main/packages/shell-init-generator/src/shell-generators/BaseShellGenerator.ts` (CLI wrapper function generation)

## Desired outcome

Go's shell initialization generator matches the fast completions configuration and CLI wrapping of the legacy TypeScript engine, preventing compinit shell lag and exporting a reliable `dotfiles` shell wrapper.

## Acceptance criteria

- [x] **Remove Unconditional `compinit`**: Update `pkg/shellinit/shellinit.go` to remove the unconditional `autoload -Uz compinit && compinit -u` command. Let it unique-prepend the completions directory to `fpath` silently, identical to TS.
- [x] **Implement CLI Wrapper Function**: Update `generateShellScripts` in `pkg/orchestrator/orchestrator.go` to generate a native shell wrapper function `dotfiles` that invokes the compiled binary and automatically binds the `--config` file flag.
- [x] **Unit Testing**: Add tests inside `pkg/shellinit/shellinit_test.go` and `pkg/orchestrator/orchestrator_test.go` asserting that the Zsh output matches the compinit omission and that the generated main script contains the `dotfiles` shell wrapper.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
