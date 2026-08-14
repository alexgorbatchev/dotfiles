# pkg/utils

Path manipulation and common helper utilities.

## Commands

- Test: `go test ./pkg/utils/...`

## Local conventions

- Shorten user home paths with `~` (`ContractHomePath`).

## Local gotchas

- ContractHomePath failing on relative paths -> resolve absolute path before contracting `$HOME`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `utils_test.go`.
- Ask first: modifying path contraction logic.
- Never: expose raw home directory paths when `~` contraction is expected.

## References

- `pkg/utils/utils.go`
