# pkg/orchestrator

Tool installation, shim/symlink generation, and shell script orchestration pipeline.

## Commands

- Test: `go test ./pkg/orchestrator/...`
- Generate against sandbox: `go run ./cmd/dotfiles --config .tmp/sandbox/dotfiles.sandbox.config.ts generate`

## Local conventions

- Check binary existence ONLY in `targetDir` or `binariesDir` before executing completion commands (do NOT check or execute system `PATH` binaries).
- Always use the injected `fs.FS` (`ResolvedFS.IsAbs()` / `ResolvedFS.Abs()`) for resolving user/tool paths (such as `binaryPath`, symlinks, completion sources) instead of raw stdlib `filepath.IsAbs`.
- Resolve a manual tool's `binaryPath` (shim target, shadow-check delegation target) only through `installer.ResolveBinaryPath`, the helper the installers use, so a shim never points somewhere other than where the installer looked.
- Skip missing completion binaries instantly in 0ms without spawning subprocesses or wasting timeouts.
- Apply strict process-group timeouts (max 3s) for running completion commands (`cmdExec.SetProcessGroup(true)`).
- Log `INFO [system] DONE` at the end of generation workflows.
- Use deterministic `.staging` directory during non-external tool installations and configure persistent download caching on all installer plugins.
- `ensureShimDirs` is the only place either pipeline creates `paths.targetDir` and the usage-log directory, under the `"system"` owner. Recorded against a tool they become that tool's stale shims on the next `generate`; `CleanupStaleShims` therefore also skips any recorded path that is a directory.
- Detect cross-tool conflicts (aliases shadowing binaries, functions shadowing binaries, alias/function/binary collisions) and warn during generation (`WarnConflicts`) and validation (`DetectConflicts`).
- The synced package directory (`.generated/node_modules/@alexgorbatchev/dotfiles/`) holds exactly what `pkg/embedded`'s `dist` contains: `SyncTypeScriptTypes` removes anything else, so a declaration an older release emitted cannot linger. The bin-name registry and the CLI-owned tsconfig live in `.generated/` itself and are outside that prune.
- `SyncTypeScriptTypes` receives every configured tool, not the pruned list: the bin-name registry it writes describes the configuration, so disabled and hostname-scoped tools stay in it. It also owns `.generated/tsconfig.json` (via `pkg/typecheck.Program`); the project's own `tsconfig.json` is only written when absent or byte-identical to the one an earlier version generated (`pkg/scaffold.IsLegacyProjectTSConfig`).
- Shadow checking runs asynchronously across active tools during `GenerateTools`, checking binaries, aliases, and functions against external system PATH executables and shell builtins (zsh, bash, powershell), suppressing warnings when a binary intentionally delegates to the external target (including matching recorded installation paths with symlink resolution, tool-managed shell paths, existing shim executables, and Homebrew package manager prefixes).
- `update.go` (with `check.go`) owns the update decision shared by the CLI's `tool update` and the dashboard's update route: `PlanUpdate` turns an installer's `CheckUpdate` answer into an `UpdatePlan` (a failed check is an error, `installer.ErrUpdateCheckUnsupported` a reinstall without a target) and `ApplyUpdate` reinstalls with force from a copy of the tool configuration. `CheckTool` (for `tool check` and the dashboard's check-update route) and `ClassifyCheck` (for `PlanUpdate`) are the one classification of a check (`CheckStatus`: `up-to-date`, `update-available`, `ahead-of-latest`, `unsupported`, `not-installed`). A tool with no installation record is `not-installed`, never a failed check or an update; an installer marked by `installer.UpdateCheckNeedsInstallation` (brew, apt, dnf, pacman) is not asked about it at all; an installation ahead of the latest release is never reinstalled at the older release, and `--force` reinstalls the installed version. Callers must not reimplement any of these.
- Shell CLI wrapper function `dotfiles()` uses `getCliCommand()` (via `formatCliCommandForShell`) to resolve the executing binary/command (including dev `go run` or `DOTFILES_CLI_COMMAND`) unquoted rather than hardcoding `targetDir/dotfiles`.

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
