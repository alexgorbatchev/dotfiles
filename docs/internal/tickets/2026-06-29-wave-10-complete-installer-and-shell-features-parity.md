---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Complete Installer and Shell Features Parity

## Problem

A series of core architectural and dynamic feature gaps exist between individual Go installer plugins and their TypeScript predecessors:

1. **No Package Manager Binary Tracking**: Package installers like `brew`, `npm`, `apt`, `dnf`, `pacman`, and `pkg` return empty lists for installed binaries, bypassing shim generation and state recording inside the registry database.
2. **Missing `shellInit` Hook**: The `shellInit` installer hook (which registers commands like `source "plugin.zsh"` for `zsh-plugin`) is missing in Go's installer interfaces. Zsh plugins are cloned but never loaded.
3. **Uncompressed `.tar` Support Missing**: The archive extractor's top-level dispatch router `Extract()` lacks an uncompressed `.tar` extension check, throwing immediate errors on plain tars.
4. **Hard Links Extracted as Symlinks**: Go's archive extractor handles `tar.TypeLink` (hard links) identically to `tar.TypeSymlink`, creating symlinks instead of hard links.
5. **Sub-process & Goroutine Leak**: `extractTarXz` spawns an `xz` command pipeline but fails to close the pipe reader on early error paths, causing the subprocess to hang indefinitely as a zombie.
6. **Missing File Attributes/Chtimes**: The Go archive extractor does not restore file modification/access times or permissions from the archive, writing all files with the system "now" time.
7. **Missing User-Agent Header**: GitHub API requests made by `pkg/installer/github.go` lack a `User-Agent` header, violating GitHub API guidelines and causing arbitrary `403 Forbidden` errors under high-traffic environments.

## Why this matters

These small but critical functional gaps and semantic bugs degrade installation reliability and security. Missing shims for package managers, omitted shell plugin sourcing, and resource leaks make the Go CLI fragile in production.

## Observed context

- Go files:
  - `pkg/installer/` (all installer plugins)
  - `pkg/archive/archive.go` (zip/tar extractors)

## Desired outcome

Complete functional parity is restored to all individual installer plugins, archive extraction formats, and shell initializers, matching TypeScript behavior 1:1 and resolving critical security and resource leak issues.

## Acceptance criteria

- [ ] **Implement Binary Tracking**: Update Go package installers (`brew`, `npm`, `apt`, etc.) to return full list of binaries, enabling shim generation and registry tracking.
- [ ] **Add Shell-Init Hooks**: Add `GetShellInit` or a similar capability to the Go `Installer` interface to fetch shell init configurations for active and bypassed installations.
- [ ] **Fix Tar Extraction Gaps**:
  - Add plain `.tar` support to the top-level `Extract()` router.
  - Fix hard link extraction, writing real hard links rather than converting them to symlinks.
  - Close pipe readers (`pr`) under deferred/cleanup paths inside `extractTarXz` to prevent zombie `xz` processes and goroutine leaks.
  - Restore file modification times (`Chtimes`) during TAR and ZIP extractions.
- [ ] **Add User-Agent to GitHub API**: Ensure all outgoing HTTP requests inside `pkg/installer/github.go` and downloader classes set a default, project-specific `User-Agent` header.
- [ ] **Unit testing**: Write unit tests verifying:
  - Dynamic shell init retrieval for Zsh plugins.
  - Tar extraction with hard links and uncompressed tars inside `pkg/archive/archive_test.go`.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
