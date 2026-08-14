# pkg/shellinit

Shell initialization script generator (main.zsh, main.bash, main.ps1, .once/).

## Commands

- Test: `go test ./pkg/shellinit/...`

## Local conventions

- Generate priority-sorted shell initialization files (`path` > `completion` > `script` > `env` > `command`).

## Local gotchas

- Re-running `.once` scripts on every shell launch -> verify `.once` script state marker files before execution.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `shellinit_test.go`.
- Ask first: modifying shell initialization file naming or loading order.
- Never: break priority ordering when generating shell blocks.

## References

- `pkg/shellinit/shellinit.go`
