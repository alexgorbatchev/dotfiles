# pkg/orchestrator

Tool installation, shim/symlink generation, and shell script orchestration pipeline.

## Commands

- Test: `go test ./pkg/orchestrator/...`
- Generate against sandbox: `go run ./cmd/dotfiles --config .tmp/sandbox/dotfiles.sandbox.config.ts generate`

## Local conventions

- Check binary existence ONLY in `targetDir` or `binariesDir` before executing completion commands (do NOT check or execute system `PATH` binaries).
- Skip missing completion binaries instantly in 0ms without spawning subprocesses or wasting timeouts.
- Apply strict process-group timeouts (max 3s) for running completion commands (`cmdExec.SetProcessGroup(true)`).
- Log `INFO [system] DONE` at the end of generation workflows.

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
