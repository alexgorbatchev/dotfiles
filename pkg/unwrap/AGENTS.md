# pkg/unwrap

Resolvable value unwrapper.

## Commands

- Test: `go test ./pkg/unwrap/...`

## Local conventions

- Unwrap static values, sync functions, and async functions into resolved values.

## Local gotchas

- Unhandled Promise rejections when unwrapping async functions -> await async functions before returning.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `unwrap_test.go`.
- Ask first: changing `Resolvable` type definition.
- Never: return unresolved function references.

## References

- `pkg/unwrap/unwrap.go`
