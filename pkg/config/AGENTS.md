# pkg/config

Project and tool configuration structures, platform resolution, and context helpers.

## Commands

- Test: `go test ./pkg/config/...`

## Local conventions

- Accept interfaces, return concrete structs in Go functions.
- Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).

## Local gotchas

- Modifying `ToolConfig` struct field JSON tags without updating typegen breaks TypeScript type generation -> run `bun compile` after changing config structs.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `config_test.go` for any config struct modifications.
- Ask first: changing public project configuration options or path schema.
- Never: break JSON serialization contracts for `ProjectConfig` or `ToolConfig`.

## References

- `pkg/config/config.go`
- `pkg/config/config_test.go`
