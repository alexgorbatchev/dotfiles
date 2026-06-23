---
created_on: 2026-06-22 12:00
last_modified: 2026-06-23 16:30
status: current
ticket_status: closed
---

# Wave 2: HTTP Downloader, Archive Extractor, Unwrapping Engine, Config Structures, and Version Checker

## Problem

Resource downloading, archive extraction, template rendering, configurations, and version checking are currently implemented in Bun using multiple distinct packages. A unified Go structure is required to ensure standard-library-first HTTP and archive operations, secure string template unwrapping, strong structural configuration validation, and semantic version resolution.

## Why this matters

Downloading and unpacking tools represent the primary side effects of the installer. Ensuring that downloads can be resumed and cancelled, archives can be safely unpacked, templates are processed securely, configurations are validated with explicit rules, and semver constraints are matched correctly is critical for stability.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3, Section 4, Section 7, and Section 9.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/downloader/downloader.go` (implement HTTP/HTTPS download manager)
  - `pkg/archive/archive.go` (implement tar/zip extraction)
  - `pkg/unwrap/unwrap.go` (implement regex/template value evaluator)
  - `pkg/config/config.go` (implement config structures and validation receivers)
  - `pkg/version/version.go` (implement semantic version checkers)

## Desired outcome

High-performance, concurrent utilities that handle downloads, archive extraction, configuration unmarshaling, schema validation, and version evaluation utilizing standard Go libraries.

## Acceptance criteria

- [x] `pkg/downloader` must implement an HTTP download client utilizing the native `net/http` library with resume capability and SHA256 integrity verification.
- [x] `pkg/downloader` must respect cancellation contexts (`context.Context`) to prevent connection leaks.
- [x] `pkg/archive` must handle archive extraction for `.zip`, `.tar.gz`, `.tar.bz2` formats using standard library utilities, and invoke external commands for `.dmg`/`.pkg` formats.
- [x] `pkg/unwrap` must implement a safe pattern evaluator using Go's `text/template` engine to resolve placeholders such as `{{ .Version }}` and `{{ .Arch }}`.
- [x] `pkg/config` must host struct schemas matching the original JSON/YAML project and tool configurations.
- [x] `pkg/config` structs must implement explicit `Validate() error` method receivers to check configuration rules without relying on external libraries.
- [x] All configuration structs must feature explicit `json` and `yaml` camelCase tags to ensure correct mapping in Sobek's VM reflection unmarshaling.
- [x] `pkg/version` must evaluate semantic version boundaries and parse local vs upstream remote versions.
- [x] All packages in this ticket must achieve a minimum of 90% function-level test coverage.
- [x] Downloader tests must not issue active network queries and must utilize local mock servers via `httptest.NewServer`.
- [x] The work must be reviewed by a sub-agent, and all issues must be addressed until the sub-agent reviewing the code returns no further issues.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
