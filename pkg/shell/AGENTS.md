# pkg/shell

Shell type detection and environment configuration.

## Commands

- Test: `go test ./pkg/shell/...`

## Local conventions

- Support zsh, bash, and powershell syntax generation.

## Local gotchas

- Syntax differences between zsh and bash -> ensure shell-specific script escaping is validated.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `shell_test.go`.
- Ask first: adding new target shell support.
- Never: emit zsh-only syntax into bash initialization files.

## References

- `pkg/shell/shell.go`
