# cmd/dotfiles

Main CLI entrypoint, Cobra subcommands, and service bootstrap.

## Commands

- Dev CLI run: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts generate`
- Test subcommands: `go test ./cmd/dotfiles/...`

## Local conventions

- Use `.tmp/` inside the project folder for temporary scripts and sandboxing. Never use global `/tmp`.
- Set strict execution timeouts on subprocesses (max 1m for CLI generation runs).
- Register all CLI subcommands on `rootCmd` in `cmd/dotfiles/`.

## Local gotchas

- Running CLI against production files without `--dry-run` mutates user state -> use test projects or sandbox configs (`.tmp/sandbox/`) during manual testing.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `subcommands_test.go` for any subcommand modifications.
- Ask first: adding new CLI subcommands or changing CLI flag names.
- Never: use global `/tmp` or modify `~/.dotfiles` directly without sandbox overrides.

## References

- `cmd/dotfiles/main.go`
- `cmd/dotfiles/subcommands_test.go`
