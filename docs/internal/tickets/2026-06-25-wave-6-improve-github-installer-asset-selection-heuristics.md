---
created_on: 2026-06-25 14:40
last_modified: 2026-06-25 14:40
status: current
ticket_status: open
---

# Wave 6: Improve GitHub Release Asset Selection Heuristics

## Problem

When using the `github-release` installer plugin in Go (`pkg/installer/github.go`), the installer queries the target GitHub repository's release API to fetch available download assets. 

However, the asset matching heuristics inside Go are extremely primitive compared to the legacy TypeScript implementation:
- **Blind Fallback Bug**: Go's `matchAsset` function simply checks for OS and Architecture substring matches (e.g. searching for "darwin" or "linux" and "amd64" or "arm64"). If none of the assets matches the search query perfectly, Go **blindly falls back to returning the first asset in the payload (`assets[0]`)**:
  ```go
  // pkg/installer/github.go:236
  if matchedAsset == nil && len(assets) > 0 {
      matchedAsset = &assets[0] // Extremely dangerous fallback!
  }
  ```
- **The Risk**: If a repository publishes multiple assets under the same tag—such as source code archives (`.tar.gz`), package descriptors, checksum files (`.sha256`), deb/rpm packages, and standalone compiled binaries—Go's blind fallback will easily select a `.sha256` text file or an incorrect architecture package instead of the intended executable binary, causing the installation to fail silently or crash.
- **TypeScript's Behavior**: TypeScript utilizes robust regex pattern matching (`assetPattern`) and asset priority lists (`assetSelector`), throwing a validation error if no suitable executable binary matches the target host machine's platform specifications.

## Why this matters

The installer plugin must be robust and secure. Downloading and attempting to run an incorrect package format (such as a `.sha256` checksum or an ARM64 binary on an Intel CPU) triggers immediate command-runner crashes or permission denied errors. Applying intelligent matching heuristics guarantees installation integrity across diverse open-source repository structures.

## Observed context

- Go GitHub release installer:
  - `pkg/installer/github.go` (contains the `matchAsset` function and its fallback logic)
- TypeScript installer equivalent:
  - `packages/installer-github/`

## Desired outcome

Go's `github-release` asset matching engine is refactored to implement intelligent filtering, prioritizations, and regex pattern matching, fully eliminating the blind `assets[0]` fallback and safely raising validation errors when no compatible asset exists for the host system.

## Acceptance criteria

- [ ] **Eliminate Blind Fallback**: Completely remove the dangerous fallback assignment `matchedAsset = &assets[0]` from `pkg/installer/github.go`.
- [ ] **Support Regex Filtering (`assetPattern`)**: Update the matching logic to accept and respect the `assetPattern` parameter if defined, filtering out assets that do not conform to the regex.
- [ ] **Implement Asset Selector Priority**: Implement priority heuristics to filter out undesired extensions (such as `.sha256`, `.md`, `.txt`, `.deb`, `.rpm`) unless explicitly configured, prioritizing standalone binary executables and compatible archive structures (`.tar.gz`, `.zip`).
- [ ] **Graceful Failure**: If no compatible asset matches the host OS, Arch, and pattern, return a clean, user-friendly error (e.g., `no compatible asset found for release "v1.0.2" matching darwin/arm64`) instead of attempting to download an incorrect format.
- [ ] **Unit Tests**: Create test tables inside `pkg/installer/github_test.go` asserting:
  - Matching succeeds on repositories with multiple mixed assets (source code, binaries, checksums).
  - Explicit `assetPattern` filters correctly.
  - Failures are raised cleanly if no matching OS/Arch can be found, preventing blind fallbacks.
- [ ] Ensure that running the command `go test ./pkg/installer/...` passes cleanly with zero failures.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
