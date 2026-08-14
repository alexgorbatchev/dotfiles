# pkg/venv

Virtual environment manager.

## Commands

- Test: `go test ./pkg/venv/...`

## Local conventions

- Create and manage virtual environment activation scripts.

## Local gotchas

- Relative path resolution in virtual environment config -> use `configFileDir` variable interpolation.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `venv_test.go`.
- Ask first: changing virtual environment layout or activation commands.
- Never: modify active user shell environment variables directly.

## References

- `pkg/venv/venv.go`
