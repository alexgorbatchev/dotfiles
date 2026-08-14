# pkg/features

Feature flag evaluation and tool catalog README generator.

## Commands

- Test: `go test ./pkg/features/...`

## Local conventions

- Generate Markdown tables for configured tools in `CATALOG.md`.

## Local gotchas

- Stale catalog output in fixtures -> delete `.generated/` and rerun CLI.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `features_test.go`.
- Ask first: modifying the tool catalog Markdown formatting layout.
- Never: overwrite manual user documentation outside `CATALOG.md`.

## References

- `pkg/features/catalog.go`
