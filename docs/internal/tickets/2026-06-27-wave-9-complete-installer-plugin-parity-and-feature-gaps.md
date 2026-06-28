---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Complete Installer Plugin Parity and Feature Gaps

## Problem

A detailed review of the 15 Go installer plugins (`pkg/installer/`) reveals multiple severe feature omissions, dynamic parameter gaps, and incorrect logic blocks compared to legacy TypeScript:

1. **Missing Global Binary Tracking**: Package managers (`brew`, `npm`, `apt`, `dnf`, `pacman`, `pkg`) in Go return empty binary lists (`[]string{}`). Shims are not generated, and files are not tracked in the SQLite database.
2. **Absence of `shellInit` Hook**: The optional `shellInit` hook (which returns raw shell sourcing lines like `source "/path/to/plugin.zsh"` for `zsh-plugin`) is completely missing in Go's installer contracts. Shell plugins are cloned but never actually loaded in the user's shell startup.
3. **`curl-tar` Hardcoded Suffix Bug**: `curl-tar` hardcodes the download file suffix as `.tar.gz`. If an asset points to a `.zip` or `.tar.xz`, it is saved as `.tar.gz`. Since Goja's extraction helper detects the format by extension, this causes extraction failures.
4. **`manual` Path Expansion Missing**: Go's `manual` installer fails to expand paths like `{stagingDir}`, preventing execution of local manual configuration installers.
5. **`curl-script` Lacks Binary Capture**: TS implements post-install binary capturing (moving binaries installed to global folders back to staging). Go lacks this, leaving physical binaries stranded on the system and un-promoted.
6. **Sudo Prompt Ignored**: Custom prompts defined in `system.sudoPrompt` are parsed but never passed to `sudo` commands (which requires `sudo -p`).
7. **Simplified Platform Matching**: In `bootstrap.go`, platform matching is implemented using hardcoded integers (`platforms == 3`). If a tool config defines `platforms = 5` (Linux | Windows), Go fails to match on Linux, skipping valid tool installations.

## Why this matters

The installer plugins are the execution arms of the monorepo. Omissions in package-managed binary tracking, shell initializations, platform configuration matches, and archive extensions cause configurations that work flawlessly in TS to fail, silently skip, or install without launching in Go.

## Observed context

- Go files:
  - `pkg/installer/` (contains all 15 installers)
  - `cmd/dotfiles/bootstrap.go` (contains `matchesPlatform`)
- TS reference:
  - `.workspaces/main/packages/installer/`
  - `.workspaces/main/packages/installer-*/`

## Desired outcome

Refactor all Go installers and pre-flight matchers to achieve 100% parameter, hook, and behavioral parity with legacy TypeScript. Ensure package-managed binaries are tracked, zsh-plugins source cleanly, platform bitwise masks evaluate correctly, and download suffixes are resolved dynamically.

## Acceptance criteria

- [ ] **Dynamic Binary Tracking**: Refactor package manager installers (`brew`, `npm`, `apt`, `dnf`, `pacman`, `pkg`) to dynamically resolve the physical install paths of their target binaries and return them in `InstallResult.Binaries`.
- [ ] **Incorporate `shellInit` Hook**: Add `ShellInit` (string) to `InstallResult` and support propagating sourcing commands dynamically to `main.zsh` (e.g. for `zsh-plugin`).
- [ ] **Dynamic `curl-tar` Extensions**: Update `curl-tar` to detect download file formats dynamically from the URL or headers instead of hardcoding `.tar.gz`.
- [ ] **Expand `manual` Paths**: Expand `{stagingDir}` and other placeholders inside the `manual` installer before execution.
- [ ] **Sudo Prompt Support**: Pass `system.sudoPrompt` parameters to elevated executions via `sudo -p` inside command runners.
- [ ] **Bitwise Platform Matching**: Implement correct bitwise masking inside `matchesPlatform` (`cmd/dotfiles/bootstrap.go`) matching the original TS specification:
  ```go
  func matchesPlatform(platforms int, osName string) bool {
      var mask int
      switch osName {
      case "linux":
          mask = 1
      case "darwin":
          mask = 2
      case "windows":
          mask = 4
      default:
          return false
      }
      return (platforms & mask) == mask
  }
  ```
- [ ] **Unit Testing**: Update the installer unit tests inside `pkg/installer/` verifying that package managers resolve binaries, `curl-tar` handles ZIP/TXZ paths, manual configs expand path wildcards, and bitwise platform masking evaluates combinations correctly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
 mooring.
