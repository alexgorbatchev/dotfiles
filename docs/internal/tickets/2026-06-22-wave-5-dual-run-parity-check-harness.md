---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 5: CI Dual-Run Parity Verification Harness with Normalized Outputs and Semantic DB Assertion

## Problem

Rewriting a complete codebase carries significant risk of regression. To guarantee absolute compliance and output consistency between the legacy TypeScript implementation and the compiled Go binary, the project needs an automated, non-interactive integration testing pipeline that checks shims, configurations, and databases.

## Why this matters

The dual-run parity harness is the final verification gate. It prevents silent regression and guarantees feature parity by normalizing system-specific paths and line endings, opening and semantically checking SQLite databases, and comparing outputs bytes-by-bytes.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 1, Section 11, Section 12, and Section 14.
- Architectural Decision Record: None.
- Codebase files affected:
  - `scripts/parity-harness/main.go` (implement the Dual-Run Parity verification harness)

## Desired outcome

An automated Go command script that compiles the Go executable, runs both implementations against standard test-projects, normalizes variable directory/date states, performs deep semantic assertions, and outputs comprehensive diffs on any failure.

## Acceptance criteria

- [ ] `scripts/parity-harness` must be written in Go and execute the verification sequence.
- [ ] The harness must compile the Go executable dynamically and save it to `.dist/dotfiles`.
- [ ] The harness must invoke the legacy TypeScript CLI (`bun cli`) against target mock fixtures inside `test-project-npm` in `--dry-run` mode, writing outputs to `.generated/ts/`.
- [ ] The harness must invoke the compiled Go binary (`.dist/dotfiles`) against the exact same targets in `--dry-run` mode, writing outputs to `.generated/go/`.
- [ ] The harness must normalize CRLF line endings to LF before comparing output bytes.
- [ ] The harness must replace developer-specific home directories with a normalized string placeholder (e.g., `{{HOME}}`) to prevent platform false negatives.
- [ ] The harness must query both output SQLite databases to semantically compare written tables, ignore auto-incrementing primary keys or dynamic timestamps, and ensure identical installations.
- [ ] The harness must recursively traverse and assert exact equality between `.generated/ts/` and `.generated/go/`.
- [ ] If any mismatch is encountered, the harness must write a detailed, descriptive diff to stderr and exit with non-zero exit code `1`.
- [ ] The parity script must be integrated as the final gate in the CI script before accepting a migration as complete.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
