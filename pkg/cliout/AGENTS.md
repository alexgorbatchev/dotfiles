# pkg/cliout

CLI output formatting for human and agent modes, interactive terminal detection, user confirmation prompts, horizontal dividers, and directory tree rendering.

## Commands

- Test: `go test ./pkg/cliout/...`

## Local conventions

- Agent mode detection (`IsAgentMode`): returns true when `AGENT` is set to `1`, `true`, or `yes` (case-insensitive).
- Dual-mode JSON serialization (`RenderJSON`):
  - Agent mode (`AGENT=1`): minified single-line JSON without extra whitespace.
  - Human mode (`AGENT=0` or unset): pretty-printed multiline JSON indented with 2 spaces.
- Hierarchical tree formatting (`FormatTree`):
  - Agent mode: token-efficient indented bullets (`* item`).
  - Human mode: standard box-drawing glyphs (`├─ `, `└─ `, `│  `).
- Interactive terminal detection (`IsTerminal`): checks if value is an `*os.File` descriptor connected to a terminal (via `isatty`); in-memory buffers and pipes always evaluate to false.
- User confirmation prompts (`Confirm`): prompts with `[y/N]`, returning true only for affirmative answers (`y`, `yes`, case-insensitive).
- Terminal dividers (`RenderDivider`): renders horizontal rule across terminal width (respecting `COLUMNS` or 80 columns) in human mode; produces no output in agent mode.

## Local gotchas

- Agent mode suppresses ANSI colors, decorative dividers, and indented JSON to keep output token-efficient and machine-readable for AI agents.
- Non-file writers (e.g. `bytes.Buffer`, mock pipes) are never interactive terminals -> `IsTerminal` strictly returns false for in-memory streams.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `cliout_test.go` for any CLI output formatting changes.
- Ask first: modifying agent mode environment variable triggers or changing tree rendering syntax.
- Never: output decorative terminal dividers or multi-line indented JSON when `AGENT=1`.

## References

- `pkg/cliout/cliout.go`
- `pkg/cliout/cliout_test.go`
