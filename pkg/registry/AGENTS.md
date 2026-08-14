# pkg/registry

Tool installation and file operation state registry.

## Commands

- Test: `go test ./pkg/registry/...`

## Local conventions

- Record file operations (`writeFile`, `rm`, `chmod`, `symlink`) in SQLite transaction batches.

## Local gotchas

- File operation records outside transactions can cause partial state on error -> always wrap batch writes with `WithTx`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `registry_test.go`.
- Ask first: modifying database operation types or registry query methods.
- Never: delete registry state without corresponding file cleanup.

## References

- `pkg/registry/registry.go`
