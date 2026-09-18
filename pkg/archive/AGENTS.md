# pkg/archive

Archive extraction utilities (.tar.gz, .zip, .dmg, .pkg, .tar.xz).

## Commands

- Test: `go test ./pkg/archive/...`

## Local conventions

- Preserve file permissions and symlink targets during archive extraction.
- `supportedExtensions` in `archive.go` is the only definition of what `Extract` can unpack; `Extension`, `IsSupported` and `SupportedExtensions` expose it to installers. Adding a format means adding its suffix there (compound suffix before the bare one it ends with) and a `case` in `Extract`; `TestSupportedExtensionsDispatch` fails when the two disagree. `unsupportedExtensions` names archive suffixes `Extract` recognises but cannot unpack so that callers can refuse them instead of treating them as raw binaries.

## Local gotchas

- Path traversal vulnerabilities in archive headers (Zip Slip) -> sanitize extraction paths with `filepath.Clean`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `archive_test.go`.
- Ask first: adding support for new archive formats.
- Never: allow unsafe relative paths that break out of the target extraction directory.

## References

- `pkg/archive/archive.go`
