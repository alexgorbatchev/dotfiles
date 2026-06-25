---
created_on: 2026-06-25 14:00
last_modified: 2026-06-25 14:00
status: completed
ticket_status: closed
---

# Wave 6: Resolve Missing ctx VM Argument and Add Sandbox I/O Bindings

## Problem

In the legacy TypeScript configuration engine, tool configuration callback functions registered via `defineTool` receive two parameters: `install` (the package installer builder) and `ctx` (the tool configuration context containing runtime identifiers and logging helpers):

```typescript
export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => any;
```

In the compiled Go-native JS VM bootstrapper (`pkg/vm/vm.go` and `pkg/vm/bindings.go`), when the engine executes the transpiled `.tool.ts` configurations inside the embedded Sobek JS VM, **it completely omits the second argument (`ctx`)**:

```javascript
if (typeof callback === "function") {
  const res = callback(install); // CRITICAL BUG: Only passes install!
}
```

This means that `ctx` resolves to `undefined` inside the Sobek VM. If any user-authored `.tool.ts` config file attempts to inspect platform properties (such as `ctx.systemInfo.os` or `ctx.systemInfo.arch`) or invoke logging methods (such as `ctx.log.info()`), the execution crashes instantly with a `TypeError: Cannot read property 'systemInfo' of undefined`.

Additionally, while the public TypeScript schemas expose an `IFileSystem` interface, the Go Sobek VM registers **zero sandboxed filesystem bindings**. This makes it impossible for tool configuration scripts to perform basic, safe in-sandbox file existence checks or dynamic sub-path evaluations during runtime loading without hard-bypassing virtual filesystem boundaries with real OS-level calls.

## Why this matters

The `ctx` parameter is a core component of the tool-configuration DSL. Multiple production toolconfigs rely on inspecting environment details (such as whether libc is musl/glibc) and logging execution checkpoints. Failing to provide this context leads to catastrophic runtime failures for standard tools. Furthermore, providing sandboxed filesystem bindings within the VM is necessary to keep JS configurations secure and isolated inside virtual volumes during execution, avoiding host system leaks.

## Observed context

- Go VM bootstrap and evaluation logic:
  - `pkg/vm/vm.go` (contains `EvaluateToolDefinition` where callback execution occurs)
  - `pkg/vm/bindings.go` (handles Go-to-JS VM variable and method bindings)
- TypeScript public schemas and DSL types:
  - `packages/build/src/build/steps/generateSchemaTypes.ts` (defines `IToolConfigContext` and `defineTool` signatures)

## Desired outcome

The embedded Sobek JS VM is upgraded to initialize and inject a robust, fully-populated context object `ctx` matching the TypeScript `IToolConfigContext` interface. This context object will carry a detailed `systemInfo` structure and a bridged structured logging engine, alongside secure read-only sandboxed filesystem bindings that map to the underlying `fs.FS` instance.

## Acceptance criteria

- [ ] **Context Injection inside Sobek VM**: Update `pkg/vm/vm.go` (and related bindings) to construct and register a JavaScript object representing `ctx` before calling the configuration callback:
  - Ensure the callback is invoked as `callback(install, ctx)`.
- [ ] **System Information Mapping**: Populate `ctx.systemInfo` with system properties mapping Go's system detection features:
  - `os` (string matching "darwin", "linux", "windows").
  - `arch` (string matching "amd64", "arm64").
  - `libc` (string or null, e.g., "glibc", "musl").
- [ ] **Logger Bridging**: Bind `ctx.log` methods (`info`, `warn`, `error`, `debug`) to Go's structured logger wrapper (`pkg/logger`), ensuring log messages are properly tagged with the tool name context.
- [ ] **Sandboxed File System Bindings**: Implement and register read-only filesystem bindings (`ctx.fs.exists`, `ctx.fs.readDir`, `ctx.fs.readFile`) that delegate directly to the orchestrator's active virtual `fs.FS` volume (rather than hard-bypassing via Go's standard library `os` package).
- [ ] **Global Helper Availability**: Register utility helper bindings globally inside the JS VM (`isMac()`, `isLinux()`, `detectLibc()`) and synchronize them inside the ambient `.d.ts` declaration templates (`generateSchemaTypes.ts`).
- [ ] **Unit Testing**: Create exhaustive test cases inside `pkg/vm/vm_test.go` (or a new `pkg/vm/vm_context_test.go` file) asserting:
  - A mock JS configuration callback successfully receives both `install` and `ctx`.
  - Calling `ctx.log.info("msg")` forwards the message to the test structured logger.
  - Accessing `ctx.systemInfo.os` returns the correct host operating system string.
  - Evaluating sandboxed FS checks inside the script successfully interrogates a mocked virtual `MemFS` volume.
- [ ] Ensure that running the command `go test ./pkg/vm/...` passes cleanly with 100% success.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
