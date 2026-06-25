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

- [ ] Write a dedicated, exhaustive Go unit test suite inside `pkg/vm/pointer_unmarshal_test.go` to validate pointer-field unmarshaling against `config.ToolConfig` and `config.ToolConfigUpdateCheck` structures.
- [ ] **String Pointers Verification**:
  - Assert that evaluating script `tool = { name: "test", version: "1.4.2" };` results in a non-nil `toolCfg.Version` where `*toolCfg.Version == "1.4.2"`.
  - Assert that evaluating script `tool = { name: "test" };` (omitted version) results in `toolCfg.Version == nil`.
  - Assert that evaluating script `tool = { name: "test", version: null };` or `tool = { name: "test", version: undefined };` results in `toolCfg.Version == nil` with zero exceptions thrown.
- [ ] **Bool Pointers Verification**:
  - Assert that evaluating script `tool = { name: "test", updateCheck: { enabled: true } };` results in a non-nil `toolCfg.UpdateCheck.Enabled` where `*toolCfg.UpdateCheck.Enabled == true`.
  - Assert that evaluating script `tool = { name: "test", updateCheck: { enabled: false } };` results in a non-nil `toolCfg.UpdateCheck.Enabled` where `*toolCfg.UpdateCheck.Enabled == false`.
  - Assert that evaluating script `tool = { name: "test", updateCheck: {} };` results in `toolCfg.UpdateCheck.Enabled == nil` and `toolCfg.UpdateCheck.Constraint == nil`.
- [ ] **Custom Unmarshal Wrapper**: If Sobek's default `ExportTo` behaves inconsistently on pointers (e.g. failing to set `nil` or defaulting optional parameters incorrectly), implement a custom unmarshalling helper `ExportToWithPointers` inside `pkg/vm/vm.go` that resolves fields via JSON-unmarshaling or explicit JS-value key mapping to guarantee correct pointer assignment.
- [ ] Ensure that running the command `go test ./pkg/vm -run TestPointerUnmarshal` executes successfully and returns a clean green pass on all pointer cases.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
