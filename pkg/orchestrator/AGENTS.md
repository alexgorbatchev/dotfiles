# pkg/orchestrator

Tool installation, shim/symlink generation, and shell script orchestration pipeline.

## Commands

- Test: `go test ./pkg/orchestrator/...`
- Generate against sandbox: `go run ./cmd/dotfiles --config .tmp/sandbox/dotfiles.sandbox.config.ts generate`

## Local conventions

- Check binary existence ONLY in `targetDir` or `binariesDir` before executing completion commands (do NOT check or execute system `PATH` binaries).
- Always use the injected `fs.FS` (`ResolvedFS.IsAbs()` / `ResolvedFS.Abs()`) for resolving user/tool paths (such as `binaryPath`, symlinks, completion sources) instead of raw stdlib `filepath.IsAbs`.
- Skip missing completion binaries instantly in 0ms without spawning subprocesses or wasting timeouts.
- Apply strict process-group timeouts (max 3s) for running completion commands (`cmdExec.SetProcessGroup(true)`).
- Log `INFO [system] DONE` at the end of generation workflows.
- Use deterministic `.staging` directory during non-external tool installations and configure persistent download caching on all installer plugins.
- `ensureShimDirs` is the only place either pipeline creates `paths.targetDir` and the usage-log directory, under the `"system"` owner. Recorded against a tool they become that tool's stale shims on the next `generate`; `CleanupStaleShims` therefore also skips any recorded path that is a directory.
- The synced package directory (`.generated/node_modules/@alexgorbatchev/dotfiles/`) holds exactly what `pkg/embedded`'s `dist` contains: `SyncTypeScriptTypes` removes anything else, so a declaration an older release emitted cannot linger. The bin-name registry and the CLI-owned tsconfig live in `.generated/` itself and are outside that prune.
- `SyncTypeScriptTypes` receives every configured tool, not the pruned list: the bin-name registry it writes describes the configuration, so disabled and hostname-scoped tools stay in it. It also owns `.generated/tsconfig.json` (via `pkg/typecheck.Program`); the project's own `tsconfig.json` is only written when absent or byte-identical to the one an earlier version generated (`pkg/scaffold.IsLegacyProjectTSConfig`).

## Local gotchas

- Executing generated shims during completion checks causes infinite recursion / nested `install` calls -> check `binariesDir` directly for the actual binary target, not `targetDir` shims.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `orchestrator_test.go` for any orchestrator modifications.
- Ask first: changing tool dependency resolution order or topological sort logic.
- Never: execute system `PATH` executables for completion script generation; spawn completion commands without process group timeouts.

## References

- `pkg/orchestrator/orchestrator.go`
- `pkg/orchestrator/orchestrator_test.go`
