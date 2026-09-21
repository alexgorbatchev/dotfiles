# pkg/features

Tool readme parsing and the on-disk readme cache.

## Commands

- Test: `go test ./pkg/features/...`

## Local conventions

- `ParseReadme` extracts YAML frontmatter into `Metadata` and returns the remaining
  markdown; it never fails on a missing or malformed frontmatter block.
- `ReadmeCache` stores one JSON file per tool under its directory and treats an entry
  older than the requested TTL as absent.

## Local gotchas

- Stale generated output in fixtures -> delete `.generated/` and rerun the CLI.
- There is no catalog generator. `features.catalog` is accepted by the configuration
  loader and nothing reads it.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `readme_test.go`.
- Ask first: changing the readme metadata format or the cache file layout.
- Never: write documentation files outside the cache directory this package owns.

## References

- `pkg/features/readme.go`
