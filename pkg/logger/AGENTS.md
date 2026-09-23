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
- Logger args are positional values, not slog key/value pairs: `"error", err` prints the literal `error`, and outside `--trace` `filterArgs` drops any `error` arg whose text names no `.tool.ts` location (`FormatErrorForUser`) -> fold the cause into the `logger.Message` with `%v` (its text keeps any tool-file location) and never pass an `error` as an arg in production code. `callsites_test.go` type-checks `cmd/`, `pkg/` and `scripts/` for darwin, linux and windows and fails on any call passing a value that is or may hold an `error` (including `any` and spread arguments). It needs the embedded assets `just prepare` generates, like every Go build in this module. `filterArgs` keeps v1's filtering unchanged; production code gets tool-file locations from the `%v` text instead of an error argument.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `logger_test.go` for any logger modifications.
- Ask first: changing the tab-delimited output format or log level definitions.
- Never: output unformatted raw objects or double context tags.

## References

- `pkg/logger/logger.go`
- `pkg/logger/logger_test.go`
