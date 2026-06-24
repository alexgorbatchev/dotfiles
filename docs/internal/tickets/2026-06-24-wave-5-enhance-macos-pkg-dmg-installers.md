---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:20
status: current
ticket_status: open
---

# Wave 5: Enhance macOS PKG and DMG Installers in Go

## Problem

Go's macOS `pkg` and `dmg` installer plugins are extremely primitive. They are limited to performing direct static downloads of single files via `url`.
* **The Limitation:** They do not support extracting `.pkg` or `.dmg` files from zipped archives, running hooks, or resolving assets dynamically using the GitHub API client.
* **TypeScript's Behavior:** The TS `dmg` and `pkg` plugins are extremely mature, sharing a unified, polymorphic `source` engine that accepts either a direct URL or resolves the correct asset dynamically from GitHub releases using the API client, unpacking archives on demand.

## Why this matters

macOS users expect the toolchain to seamlessly manage complex disk images and installer packages. Supporting zipped archives and dynamic GitHub asset resolution in Go ensures that macOS environments are fully supported without forcing users to hardcode static, unstable direct URLs.

## Observed context

- Specified in `packages/installer-dmg` and `packages/installer-pkg`.
- Codebase files affected:
  - `pkg/installer/dmg.go` (extend parameters and extraction logic)
  - `pkg/installer/pkg.go` (extend parameters and extraction logic)

## Desired outcome

Go's macOS `pkg` and `dmg` installers achieve 100% feature parity with TypeScript, fully supporting zipped archives, dynamic GitHub asset resolution, and lifecycle hooks.

## Acceptance criteria

- [ ] Refactor `pkg/installer/dmg.go` and `pkg/installer/pkg.go` to support a polymorphic `source` parameter matching TS schemas.
- [ ] Integrate GitHub Release resolving logic inside Go's `dmg` and `pkg` installers to fetch download assets dynamically from GitHub releases on demand.
- [ ] Implement compressed archive extraction (e.g. `.zip`, `.tar.gz`) support for compressed PKG/DMG files.
- [ ] Write unit tests inside `pkg/installer/dmg_test.go` and `pkg/installer/pkg_test.go` verifying the correct resolution, extraction, and installation of complex DMG/PKG configurations.
- [ ] Run `bun check` and `bun check:ci` to verify all checks pass cleanly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
---
