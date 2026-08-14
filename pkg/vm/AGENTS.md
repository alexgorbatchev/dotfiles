# pkg/vm

Goja JS VM, TypeScript config loader, and authoring DSL bindings.

## Commands

- Test: `go test ./pkg/vm/...`

## Local conventions

- Export `dedentString`, handle multi-platform `.platform()` calls cleanly, and pass `projectConfig` in `toolCtx`.
- Ensure async tool callbacks return the underlying `builder` rather than a raw JS `Promise` object.

## Local gotchas

- Evaluating multiple `.platform()` blocks on non-matching OS can leave tool permanently disabled -> delete `disabled` property when a subsequent `.platform()` block matches the active OS/arch.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `vm_test.go` / `loader_test.go` for any VM modifications.
- Ask first: modifying global VM bindings or TypeScript DSL API contracts.
- Never: break backwards compatibility with existing `.tool.ts` authoring files.

## References

- `pkg/vm/loader.go`
- `pkg/vm/loader-api.ts`
