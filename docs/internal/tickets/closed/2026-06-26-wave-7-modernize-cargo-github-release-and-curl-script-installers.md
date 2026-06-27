---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Modernize cargo, github-release and curl-script Installers

## Problem

Several installer plugins in Go have critical functional, performance, and security gaps compared to TS:

1. **Slow Cargo compilation**: Go always installs cargo crates from source via `cargo install`, requiring local Rust compilers. In TS, the cargo installer attempts to fetch pre-compiled binaries via `cargo-quickinstall` or GitHub releases for instant installation.
2. **`github-release` Substring Fallback Security Risk**: Go's `matchAsset` uses basic lowercase substring checks and, if no match is found, blindly falls back to returning the first asset in the release (`assets[0]`). This is highly dangerous and can download `.sha256` checksum files or text descriptors instead of the correct binary.
3. **`curl-script` Parameter Gaps**: Go ignores `args` (parameters passed to script execution), `env` (environment variables passed to the installer run), `versionArgs` (arguments to detect version from CLI), and `versionRegex` (regex to extract the version string) inside the `curl-script` installer. Go also cannot auto-detect versions like TS.
4. **Package Manager Update Checks**: `CheckUpdate` is a complete stub returning `HasUpdate: false` across all system package managers (apt, dnf, pacman).

## Why this matters

Security and performance are critical. Blind fallbacks can result in executable system crashes, and compiling Cargo crates entirely from source leads to massive installation times. Restoring the parameter definitions on curl scripts is necessary to support existing real-world tools.

## Observed context

- Go installers:
  - `pkg/installer/cargo.go` (lacks quickinstall check)
  - `pkg/installer/github.go` (substring fallback in `matchAsset`)
  - `pkg/installer/curl_script.go` (parameter omissions)
  - `pkg/installer/apt.go`, `pkg/installer/dnf.go`, `pkg/installer/pacman.go` (CheckUpdate stubs)

## Desired outcome

All core Go installer plugins achieve 100% parity with their TypeScript equivalents, including Cargo quickinstall, robust regex-based asset selection for GitHub releases, and parameter support for curl-script.

## Acceptance criteria

- [x] **Cargo Quickinstall**: Implement `cargo-quickinstall` or pre-compiled binary checks in `pkg/installer/cargo.go` before falling back to local compilation.
- [x] **GitHub Release Asset Selection Security**: Refactor `matchAsset` in `pkg/installer/github.go` to use stricter substring heuristics and reject non-binary files (like `.sha256`, `.txt`, `.md`, `.sig`) instead of executing a blind fallback to `assets[0]`.
- [x] **Curl-Script Parity**: Implement `args`, `env`, `versionArgs`, and `versionRegex` variables inside `pkg/installer/curl_script.go` to execute the downloaded scripts correctly and extract binary versions.
- [x] **Package Manager Updates**: Implement basic `CheckUpdate` parsing or execution checks for the native package managers (`apt`, `dnf`, `pacman`).
- [x] **Unit Testing**: Extend unit tests in `pkg/installer/*_test.go` and `tests/e2e/` verifying these capabilities.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
