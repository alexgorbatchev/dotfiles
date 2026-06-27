---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Unify Permission JSON Serialization Format

## Problem

There is a JSON format contract discrepancy between the Go and TypeScript engines regarding file permissions.

- **TypeScript Engine**: In the public type definitions and runtime mappings (`packages/registry/src/file/types.ts`), `permissions` is represented as a **decimal base-10 number** (e.g., `493` representing octal `0755`, parsed via `parseInt(row.permissions, 10)` in `FileRegistry.ts`). JSON logs and payloads output this as `"permissions": 493`.
- **Go Engine**: Inside Go structures (`pkg/registry/registry.go` and `FileOperationRecord`), permissions are represented as an **octal string** (e.g., `"0755"`). On database queries, decimal values are translated back to octal strings via `DecimalToOctalPerm`. Consequently, Go's JSON serialization outputs `"permissions": "0755"`.

This type mismatch (`number` in TS vs `string` in Go) breaks downstream log parsing integrations and dashboard clients that parse the output schema.

## Why this matters

The Go binary must act as a 100% transparent, drop-in replacement stdout-wise and database-wise. Discrepancies in JSON output schemas can break downstream continuous integration parsers or data dashboards.

## Observed context

- Go files:
  - `pkg/registry/registry.go` (contains `DecimalToOctalPerm` and JSON definitions)
  - `pkg/fs/tracked_fs.go` (format conversions)
- TS files:
  - `.workspaces/main/packages/registry/src/file/types.ts`
  - `.workspaces/main/packages/registry/src/file/FileRegistry.ts`

## Desired outcome

The Go JSON serialization matches the TypeScript JSON contract, outputting the `permissions` property as a decimal base-10 JSON number.

## Acceptance criteria

- [x] **Standardize Struct Representation**: Refactor the Go structures (e.g., `FileOperationRecord` or `FileState`) to serialize permissions as decimal integers rather than octal strings in JSON output, or implement a custom `MarshalJSON` / `UnmarshalJSON` layer.
- [x] **Preserve DB Octal Conversion**: Retain the decimal-to-string SQLite storage strategy, but guarantee that memory models and serialized logs match the decimal number contract (`493` for `0755`).
- [x] **Unit Testing**: Add a test in `pkg/registry/registry_test.go` asserting that a serialized `FileOperationRecord` translates permissions as a decimal JSON number.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
