# pkg/exec

Subprocess runner (`OSRunner`, `MockRunner`) and process group management.

## Commands

- Test: `go test ./pkg/exec/...`

## Local conventions

- Configure process-group isolation (`SetProcessGroup(true)`) and execution timeouts on subprocesses.
- Use `MockRunner` in unit tests to intercept subprocess execution.

## Local gotchas

- Subprocesses spawned without process-group isolation leave orphaned child processes on timeout -> always use `SetProcessGroup(true)` for cancellable commands.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `exec_test.go` for any runner modifications.
- Ask first: changing `CommandRunner` or `Cmd` interface definitions.
- Never: spawn unmanaged raw `exec.Command` without going through `CommandRunner`.

## References

- `pkg/exec/exec.go`
- `pkg/exec/os_runner.go`
