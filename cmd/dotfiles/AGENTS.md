# cmd/dotfiles

Main CLI entrypoint, Cobra subcommands, and service bootstrap.

## Commands

- Dev CLI run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts generate`
- Dev why run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts why <tool-or-binary>`
- Dev upgrade run: `go run ./cmd/dotfiles upgrade --check`
- Dev dashboard run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard --port 8080 --host 0.0.0.0`
- Test subcommands: `go test ./cmd/dotfiles/...`

## Local conventions

- Use `.tmp/` inside the project folder for temporary scripts and sandboxing. Never use global `/tmp`.
- Set strict execution timeouts on subprocesses (max 1m for CLI generation runs).
- Register all CLI subcommands on `rootCmd` in `cmd/dotfiles/`.
- All CLI errors, diagnostics, and status messages must use `pkg/logger` (`GetLogger`). Never use raw `fmt.Print*` or `fmt.Fprint*` on `os.Stderr` for errors.
- Keep `rootCmd.SilenceErrors: true` so Cobra does not emit duplicate unformatted errors.
- Logger writers must default to `stderr` (`os.Stderr` / `cmd.ErrOrStderr()`), keeping `stdout` (`cmd.OutOrStdout()`) clean for pipeline data.
- Support dual-mode output via `pkg/cliout` (`AGENT=1`):
  - When `AGENT=1`: suppress ANSI colors in logger, format JSON as minified single-line, render directory trees as indented bullets (`*`), omit decorative dividers, and emit compact key-value lines.
  - When `AGENT=0` (or unset): render human-friendly output, pretty-printed JSON (`json.MarshalIndent`), box-drawing tree glyphs (`├─`/`└─`), and formatted lists.
- Support `--json` flag on query commands (`check-updates`, `files`, `validate`, `detect-conflicts`, `log`, `bin`, `features`, `skill`). All JSON serialization must use `cliout.RenderJSON` so agent mode minifies automatically while human mode pretty-prints.

## Local gotchas

- Running CLI against production files without `--dry-run` mutates user state -> use test projects or sandbox configs (`.tmp/sandbox/`) during manual testing.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `subcommands_test.go` for any subcommand modifications.
- Ask first: adding new CLI subcommands or changing CLI flag names.
- Never: use global `/tmp` or modify `~/.dotfiles` directly without sandbox overrides.

## References

- `cmd/dotfiles/main.go`
- `cmd/dotfiles/why.go`
- `cmd/dotfiles/subcommands_test.go`
