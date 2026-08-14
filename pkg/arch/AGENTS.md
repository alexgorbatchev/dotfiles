# pkg/arch

Architecture detection and normalization.

## Commands

- Test: `go test ./pkg/arch/...`

## Local conventions

- Normalize architecture strings (`x86_64` -> `amd64`, `aarch64` -> `arm64`).

## Local gotchas

- Non-standard arch names in download URLs can break asset matching -> ensure normalized mapping covers legacy platform names.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `arch_test.go`.
- Ask first: changing canonical architecture string mappings.
- Never: break standard Go `GOARCH` output formatting.

## References

- `pkg/arch/arch.go`
