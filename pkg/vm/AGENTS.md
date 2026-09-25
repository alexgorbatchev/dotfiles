# pkg/vm

Goja JS VM, TypeScript config loader, and authoring DSL bindings.

## Commands

- Test: `go test ./pkg/vm/...`

## Local conventions

- Keep `loader-api.ts` strictly as a thin proxy/shim layer with close to zero logic. Its sole purpose is to expose the TypeScript authoring DSL, capture raw parameters/callbacks, and pass structured data back to Go. All evaluation logic, dependency matching, platform checks, path resolutions, and text processing MUST be performed in Go (`pkg/vm/`, `pkg/orchestrator/`).
- Export `dedentString`, handle multi-platform `.platform()` calls cleanly, and pass `projectConfig` in `toolCtx`. The `projectConfig` global is set from Go (`setJSONGlobal`) with the resolved configuration, in both the unified bundle and hook VMs; `defineConfig` returns the raw value to Go and captures nothing.
- The context a configuration factory receives is Go's: `newConfigContext` in `bindings.go` assembles it from the target, the home directory and the configuration file's directory, and the configuration VM publishes it as the `configContext` global. `defineConfig` hands that object to its callback and `resolveConfigExport` hands the same object to a bare function default export, so the two authoring forms cannot disagree about what a factory receives. Never assemble a second one in TypeScript.
- A configuration file's default export is resolved by `resolveConfigExport` in `evaluateProjectConfig` before it is decoded: a factory is called and the promise an `async` one returns is settled through `settleInVM`. `JSON.stringify` of a pending promise is `{}`, which is a valid configuration, so without this every setting the file wrote would silently become its default. The configuration file is evaluated only once, in `evaluateProjectConfig`, and the resulting `ProjectConfig` is supplied directly to subsequent steps rather than re-imported in the unified bundle.
- Serialize `RegExp` objects to their string representation using a replacer callback in all `JSON.stringify` evaluation pipelines.
- Ensure async tool callbacks return the underlying `builder` rather than a raw JS `Promise` object. Because the promise is not what `defineTool` returns, nothing else observes it: `recordToolFactory` keeps it in `__toolFactories` and `settleToolFactories` settles it in Go — in `loader.go` once the bundle has run, and in `hooks.go` after every re-evaluation of a tool file for a lifecycle hook or a function-valued install parameter — so a factory that rejects fails whichever operation reached it, naming its file, instead of dropping the tool at load time or skipping its hook at install time in silence.
- Clean internal evaluation flags (such as `_hasPlatformBlocks`, `_hasMatchingPlatform`, `_hasArchBlocks`, `_hasMatchingArch`, `_version`) from builder objects before returning to Go so they are not serialized into JSON.
- Strictly enforce `DisallowUnknownFields()` when decoding project and tool configurations in `loader.go`.
- Strongly type `IProjectConfig` and `ConfigFactory` against `ProjectConfig` without loose `Record<string, unknown>` escape hatches.
- `Libc` is the one DSL constant whose values Go binds into the runtime (`Platform` and `Architecture` are restated in `loader-api.ts` and `dsl-types.ts`, and pinned to the `pkg/config` constants by tests): `libcConstants` in `bindings.go` binds the member names to the `pkg/arch` constants detection reports, `loader-api.ts` publishes it through the `libcConstants()` binding, and `TestLibcDeclarationMatchesConstants` pins the `dsl-types.ts` declaration to the same map. Never restate a libc string in TypeScript; detection and the enum have to stay one value.
- `systemInfo.platform` and `systemInfo.arch` are the target's `Platform` and `Architecture` members, as in v1; there is no `os` string. The Go spelling of the target (`"darwin"`, `"arm64"`) is mapped to those bits only by `config.PlatformOf` / `config.ArchitectureOf`, reached through `Target.platform()` / `Target.architecture()` by both `newConfigContext` and the `getPlatform` / `getArchitecture` bindings `currentSystemInfo` in `loader-api.ts` reads. `TestPlatformAndArchitectureDeclarationsMatchConstants` pins the `dsl-types.ts` enums, and `TestPlatformAndArchitectureConstantsMatchGo` the runtime objects `loader-api.ts` exports, to the Go constants.
- Every `ctx.fs` / `fileSystem` binding reports failure through `throwOnFSError`, including the reads. `exists` is the only method for which an absent path is an answer (`false`) rather than a failure, and it still throws when the lookup itself cannot be made.
- `.bin()` records exactly one `{name, pattern?, shim?}` object per call, carrying only the members the call gave, so Go can tell "shim not mentioned" from `shim: false` and "no pattern" from a pattern. The default pattern belongs to Go (`installer.defaultBinaryPattern`), never to the DSL. A call that passes an array instead of a name, or more than the two declared arguments, throws: nothing type-checks during `generate`, so the bulk forms would otherwise install a tool with binaries missing and say nothing.
- Stage-specific lifecycle hook context interfaces (`IBeforeInstallContext`, `IAfterDownloadContext`, `IAfterExtractContext`, `IAfterInstallContext`) each extend `IHookContext` with the non-optional properties available at that stage (`stagingDir` for before-install, `downloadPath` for after-download, `downloadPath`/`extractDir`/`extractResult` for after-extract, and `installedDir`/`binaryPaths` for after-install). The `.hook(...)` builder overloads on `IToolConfigBuilder` and `IPlatformConfigBuilder` narrow the callback context parameter to the stage's specific interface when an event literal is passed, while continuing to accept general `(event: HookEvent, handler: (context: IHookContext) => Promise<unknown> | unknown)` as a fallback.

## Local gotchas

- Evaluating multiple `.platform()` blocks on non-matching OS can leave tool permanently disabled -> delete `disabled` property when a subsequent `.platform()` block matches the active OS/arch.
- Hook commands run from the tool's configuration directory, not the CLI's working directory, so `RunHook` resolves every path it hands to a hook (`stagingDir`, `installedDir`, `binariesDir`, ...) to an absolute path. A relative project path passed through unresolved makes `${stagingDir}` land inside the tool directory while the real staging directory stays empty.
- `compileFile` rewrites every `__dirname` / `import.meta.dirname` per file to that file's own directory during compilation using an esbuild plugin, matching standard Node/Bun module semantics. For `dotfiles.config.ts`, `__dirname` resolves to the configuration file's directory. For a `.tool.ts` file or helper module, `__dirname` resolves to the tool file's own directory (matching `ctx.toolDir`). The `configFileDir` global still holds the directory of the configuration file, which `ProjectConfig.ConfigFileDir` records at load. Never set it from `paths.dotfilesDir` -- that is a setting a project may point elsewhere, and it only agrees with the configuration file's directory while it is left at its default.
- `Platform` and `Architecture` are bitmasks, so a combination such as `Platform.Linux | Platform.MacOS` must be matched with a mask test rather than equality. There are exactly three platforms (Linux, MacOS, Windows); groups are composed with `|` rather than given named aliases, which is why there is no `Platform.Unix`. Matching lives in Go (`Target.matchesTarget`); `loader-api.ts` only forwards the raw values and rejects an architecture argument that arrived as `undefined`, which Go cannot tell apart from the two-argument form.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: keep `loader-api.ts` as a thin proxy/shim with close to zero logic and perform all evaluation, path resolution, and processing logic in Go.
- Always: write matching unit tests in `vm_test.go` / `loader_test.go` for any VM modifications.
- Ask first: modifying global VM bindings or TypeScript DSL API contracts.
- Never: break backwards compatibility with existing `.tool.ts` authoring files.

## References

- `pkg/vm/loader.go`
- `pkg/vm/loader-api.ts`
