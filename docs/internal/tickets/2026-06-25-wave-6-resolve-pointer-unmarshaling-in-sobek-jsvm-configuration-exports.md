---
created_on: 2026-06-25 10:30
last_modified: 2026-06-25 10:30
status: current
ticket_status: open
---

# Wave 6: Resolve Pointer Unmarshaling in Sobek JSVM Configuration Exports

## Problem

In `pkg/config/config.go`, optional properties inside configuration structures are represented using Go pointers (e.g. `Version *string` in `ToolConfig`, `Enabled *bool` and `Constraint *string` in `ToolConfigUpdateCheck`, and `Architectures *int` in `PlatformConfigEntry`). Pointers are used so that the application can distinguish between an omitted/nil field and a field explicitly set to its zero-value (like an empty string or false).

When evaluating `.tool.ts` configurations inside the embedded Sobek JavaScript VM (`pkg/vm/vm.go`), we execute the transpiled JS bundle and map the resulting JS configuration object directly into the Go `ToolConfig` struct using `vm.ExportTo()`. We need to guarantee that Sobek's VM reflection layer unmarshals JavaScript properties (which can be present, omitted, `null`, or `undefined`) safely into Go pointer fields without throwing panics, dropping fields silently, or causing nil dereferences.

## Why this matters

If Sobek fails to correctly map JS properties to Go pointers, optional settings will be lost or incorrectly initialized. For example, if a tool definition omits a custom semver constraint, it could default to an empty string instead of `nil`, triggering incorrect update checks. Ensuring reflection unmarshaling is fully tested and robust guarantees configuration integrity at runtime.

## Observed context

- Go configurations and optional fields: `pkg/config/config.go`.
- Sobek VM execution and mapping function: `pkg/vm/vm.go` (`EvaluateToolDefinition`).
- Sobek VM unit tests: `pkg/vm/vm_test.go` (if existing, or we must create it).

## Desired outcome

The VM evaluation layer evaluates JavaScript configurations and maps optional fields into Go pointer variables with 100% precision. Complete test tables cover all permutation states (`present`, `omitted`, `null`, `undefined`) to assert that Go pointers are correctly populated or left as `nil`.

## Acceptance criteria

- [ ] Write a dedicated unit test suite inside `pkg/vm/` (e.g. `vm_test.go`) to test Sobek unmarshaling behaviors on `pkg/config` structures.
- [ ] **String Pointers**: Verify that a JS string maps to a valid Go `*string` pointing to the exact value (e.g., `version: "1.4.2"` -> non-nil `*string` pointing to `"1.4.2"`).
- [ ] **Bool Pointers**: Verify that a JS boolean maps to a valid Go `*bool` (e.g., `enabled: true` -> non-nil `*bool` pointing to `true`).
- [ ] **Omitted/Undefined Fields**: Verify that omitted or undefined JS properties resolve to a `nil` pointer in Go instead of allocating empty/zero values.
- [ ] **Null Fields**: Verify that explicit JS `null` values resolve safely to a `nil` pointer in Go without throwing reflection exceptions.
- [ ] If Sobek's default `ExportTo` reflection behavior has gaps or errors on pointer boundaries, implement a robust custom unmarshaling wrapper or intermediate map parsing step to normalize the properties before mapping.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
