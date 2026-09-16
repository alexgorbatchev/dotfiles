# pkg/vm

Goja JS VM, TypeScript config loader, and authoring DSL bindings.

## Commands

- Test: `go test ./pkg/vm/...`

## Local conventions

- Keep `loader-api.ts` strictly as a thin proxy/shim layer with close to zero logic. Its sole purpose is to expose the TypeScript authoring DSL, capture raw parameters/callbacks, and pass structured data back to Go. All evaluation logic, dependency matching, platform checks, path resolutions, and text processing MUST be performed in Go (`pkg/vm/`, `pkg/orchestrator/`).
- Export `dedentString`, handle multi-platform `.platform()` calls cleanly, and pass `projectConfig` in `toolCtx`.
- Serialize `RegExp` objects to their string representation using a replacer callback in all `JSON.stringify` evaluation pipelines.
- Ensure async tool callbacks return the underlying `builder` rather than a raw JS `Promise` object.
- Clean internal evaluation flags (such as `_hasPlatformBlocks`, `_hasMatchingPlatform`, `_hasArchBlocks`, `_hasMatchingArch`, `_version`) from builder objects before returning to Go so they are not serialized into JSON.
- Strictly enforce `DisallowUnknownFields()` when decoding project and tool configurations in `loader.go`.
- Strongly type `IProjectConfig` and `ConfigFactory` against `ProjectConfig` without loose `Record<string, unknown>` escape hatches.

## Local gotchas

- Evaluating multiple `.platform()` blocks on non-matching OS can leave tool permanently disabled -> delete `disabled` property when a subsequent `.platform()` block matches the active OS/arch.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: keep `loader-api.ts` as a thin proxy/shim with close to zero logic and perform all evaluation, path resolution, and processing logic in Go.
- Always: write matching unit tests in `vm_test.go` / `loader_test.go` for any VM modifications.
- Ask first: modifying global VM bindings or TypeScript DSL API contracts.
- Never: break backwards compatibility with existing `.tool.ts` authoring files.

## References

- `pkg/vm/loader.go`
- `pkg/vm/loader-api.ts`
