# pkg/harness

Hands work to the AI coding harness a project configures as `ai.harness`: prompt generation, placeholder substitution, and the interactive run.

## Commands

- Test: `go test ./pkg/harness/...`

## Local conventions

- `ai.harness` is an argument vector run through `exec.CommandRunner` without a shell. `Argv` replaces only elements exactly equal to `Placeholder` (`"PROMPT"`); never split, join, or shell-quote the prompt. It expands a leading `~`/`$HOME` in the executable alone with `utils.ExpandHomePath` and `paths.homeDir`; other elements pass through literally.
- `Argv` is the one check of `ai.harness`: an empty list is `ErrNotConfigured`, and a list without a placeholder or with the placeholder (or nothing) in the executable position is rejected. The configuration loader only checks the key and the `string[]` type, so other commands keep working with a harness `tool make` cannot use.
- `Run` attaches the caller's streams and returns `*ExitError` carrying the harness's nonzero exit status; `cmd/dotfiles/main.go` exits with that status. Any other failure (not found, killed by a signal) is wrapped with context.
- A harness is interactive, so `Run` is the deliberate exception to the subprocess rules in `pkg/exec` and `cmd/dotfiles`: no `SetProcessGroup(true)`, which would detach it from the terminal's foreground process group, and no timeout. While it runs, `Run` catches `os.Interrupt` so `Ctrl-C` reaches only the harness instead of ending the CLI and orphaning it.
- Every command the prompt tells the harness to run uses `ToolRequest.CLI`, which `tool make` takes from `Orchestrator.CliCommandForShell("bash", ...)`; never write a bare `dotfiles`. Quote paths inside those commands with `shell.Quote`.
- `ToolPrompt` points the harness at the bundled skill (`dotfiles skill`) for authoring rules instead of restating them. Keep the prompt's steps synchronized with the `dotfiles tool make` section of the skill's CLI reference.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: test runs against the stub harness the test binary provides (`TestMain`), never a real AI harness.
- Ask first: changing the placeholder name or the `ai.harness` shape.

## References

- `pkg/harness/harness.go`
- `pkg/harness/prompt.go`
