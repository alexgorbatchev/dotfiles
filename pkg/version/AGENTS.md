# pkg/version

Version detection and constraint evaluation.

## Commands

- Test: `go test ./pkg/version/...`

## Local conventions

- Clean and normalize semver strings for version comparisons.

## Local gotchas

- Non-standard `v` prefix in release tags -> use `CleanVersion` to normalize `v1.2.3` and `1.2.3`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `version_test.go`.
- Ask first: modifying version constraint parsing logic.
- Never: compare raw un-cleaned version strings.

## References

- `pkg/version/version.go`
