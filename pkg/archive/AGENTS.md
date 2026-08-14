# pkg/archive

Archive extraction utilities (.tar.gz, .zip, .dmg, .pkg, .tar.xz).

## Commands

- Test: `go test ./pkg/archive/...`

## Local conventions

- Preserve file permissions and symlink targets during archive extraction.

## Local gotchas

- Path traversal vulnerabilities in archive headers (Zip Slip) -> sanitize extraction paths with `filepath.Clean`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `archive_test.go`.
- Ask first: adding support for new archive formats.
- Never: allow unsafe relative paths that break out of the target extraction directory.

## References

- `pkg/archive/archive.go`
