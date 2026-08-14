# pkg/logger

Type-safe structured logger and tab-delimited handler for dotfiles CLI output.

## Commands

- Test: `go test ./pkg/logger/...`

## Local conventions

- Tab-align level columns (`INFO   \t`, `WARN   \t`).
- Use single context tags (`[system]` for global/orchestrator actions, `[toolName]` for tool actions, e.g. `[tmux-sessionx]`). Never output redundant double tags like `[system] [toolName]`.
- Copy formatting patterns from `pkg/logger/logger.go`.

## Local gotchas

- Unpadded level strings break column alignment -> always pad level strings to 7 characters left-aligned (`%-7s`).

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `logger_test.go` for any logger modifications.
- Ask first: changing the tab-delimited output format or log level definitions.
- Never: output unformatted raw objects or double context tags.

## References

- `pkg/logger/logger.go`
- `pkg/logger/logger_test.go`
