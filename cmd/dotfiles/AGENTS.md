# cmd/dotfiles

Main CLI entrypoint, Cobra subcommands, and service bootstrap.

## Commands

- Dev CLI run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts state generate`
- Dev which run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts tool which <tool-or-binary>`
- Dev upgrade run: `go run ./cmd/dotfiles self upgrade --check`
- Dev dashboard run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard --port 8080 --host 0.0.0.0`
- Test subcommands: `go test ./cmd/dotfiles/...`

## Local conventions

- Use `.tmp/` inside the project folder for temporary scripts and sandboxing. Never use global `/tmp`.
- Set strict execution timeouts on subprocesses (max 1m for CLI generation runs).
- Command structure follows subject-first noun-verb hierarchy (`tool`, `path`, `shell`, `venv`, `state`, `dashboard`, `skill`, `self`).
- Root-level aliases in `root_aliases.go` (`generate`, `install`, `update`, `version`) delegate directly to their domain subcommands (`state generate`, `tool install`, `tool update`, `self version`) and are kept hidden from `--help` to preserve the clean domain hierarchy.
- Command files must strictly follow domain naming: `cmd/dotfiles/<subject>.go` for domain parents and `cmd/dotfiles/<subject>_<verb>.go` for child subcommands. File names must strictly match what is inside.
- Every runnable subcommand must declare its positional contract with a cobra `Args` validator (`cobra.NoArgs`, `cobra.MaximumNArgs(1)`, `cobra.ExactArgs(1)`, `cobra.ArbitraryArgs`, or `cobra.MatchAll(...)` with `ValidArgs` for a fixed word list) instead of checking `len(args)` inside `RunE`. Cobra validates before `RunE`, so a bad command line fails without bootstrapping services, and extra words are rejected instead of silently ignored.
- Every subcommand with a positional tool argument must set `ValidArgsFunction` to one of the helpers in `completion.go` (`completeToolName` for a single tool, `completeToolNames` for a repeatable list, `completeBinaryOrToolName` where a binary name is also accepted). Without it cobra answers `__complete` with directive 0 and every shell falls back to file-name completion.
- In tests, `executeCommand` returns stdout and stderr interleaved; use `runCommand` and its `Stdout` / `Stderr` fields when the assertion is about which stream output landed on.
- When `features.shellInstall` is enabled, `generate` updates only profile files that already exist (`shellinit.Inject`) and never creates one; a configured profile that is missing is skipped with a warning that names the profile and the script it should source.
- All CLI errors, diagnostics, and status messages must use `pkg/logger` (`GetLogger`). Never use raw `fmt.Print*` or `fmt.Fprint*` on `os.Stderr` for errors.
- Keep `rootCmd.SilenceErrors: true` so Cobra does not emit duplicate unformatted errors.
- Logger writers must default to `stderr` (`os.Stderr` / `cmd.ErrOrStderr()`), keeping `stdout` (`cmd.OutOrStdout()`) clean for pipeline data.
- Support dual-mode output via `pkg/cliout` (`AGENT=1`):
  - When `AGENT=1`: suppress ANSI colors in logger, format JSON as minified single-line, render directory trees as indented bullets (`*`), omit decorative dividers, and emit compact key-value lines.
  - When `AGENT=0` (or unset): render human-friendly output, pretty-printed JSON (`json.MarshalIndent`), box-drawing tree glyphs (`├─`/`└─`), and formatted lists.
- `validate` type-checks TypeScript projects with the `tsc` binary a configured tool declares (found by binary name, run from `<binariesDir>/<tool>/current/tsc`, never from PATH); a missing or uninstalled compiler is a validation error, not a skip. Tests for it live in `validate_typecheck_test.go` and need an on-disk project (`DOTFILES_E2E_TEST=true`) with the repository's native compiler linked in via `internal/testutil.FindTypeScriptCompiler`; `Services.InMemory` (dry runs, in-memory unit tests) skips the step with a logged message.
- Support `--json` flag on query commands (`tool check`, `tool files`, `tool validate`, `tool list`, `tool info`, `tool which`, `path`, `path list`, `path get`, `shell audit`, `state diff`, `state log`, `venv list`, `skill`). All JSON serialization must use `cliout.RenderJSON` so agent mode minifies automatically while human mode pretty-prints.
- Every command that calls `BootstrapServices` must `defer services.Close()`, never `services.DB.Close()`: `Close` also stops the `DEV_PROXY` caching proxy that the bootstrap owns (`devproxy.go`). A command with its own outbound HTTP and no `Services` (`upgrade`) calls `startDevProxy` itself; one with `Services` uses `services.HTTPClient` when it is non-nil.

## Local gotchas

- Running CLI against production files without `--dry-run` mutates user state -> use test projects or sandbox configs (`.tmp/sandbox/`) during manual testing.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `subcommands_test.go` for any subcommand modifications.
- Ask first: adding new CLI subcommands or changing CLI flag names.
- Never: use global `/tmp` or modify `~/.dotfiles` directly without sandbox overrides.

## References

- `cmd/dotfiles/main.go`
- `cmd/dotfiles/root.go`
- `cmd/dotfiles/tool.go`
- `cmd/dotfiles/tool_which.go`
- `cmd/dotfiles/subcommands_test.go`
