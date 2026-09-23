# pkg/archive

Archive extraction utilities (.tar.gz, .zip, .dmg, .pkg, .tar.xz).

## Commands

- Test: `go test ./pkg/archive/...`

## Local conventions

- Preserve file permissions and symlink targets during archive extraction. A mounted `.dmg` volume's entries are copied into `dest` with `fs.CopyTree` (`copyVolume`; the volume root is not copied, so `dest` keeps its own mode, and whatever `dest` already holds at a volume entry's path is replaced wholesale, directories included, where tar and zip merge into an existing directory), never by opening and streaming each entry. Its symlinks are reproduced as the volume holds them, absolute targets included (the drag-to-install `Applications -> /Applications` link is standard), unlike tar and zip entries, which `validateSymlink` confines to `dest`: a mounted volume is a filesystem, not a stream of entries that could write through an earlier link. This includes a relative target that climbs out of `dest`, the one deliberate exception to the relative-path boundary below: such a link reaches no further than an absolute one, so refusing it would protect nothing, copying a volume never writes through it, and code that changes or opens what such a link names resolves and confines it (`installer.PromoteBinaries`) or refuses to return it (`installer.findFileWithExtension`), while other consumers only link to it. Code that searches or promotes from an extraction must therefore not follow symlinks, or must resolve them and confine the result to `dest` (`installer.PromoteBinaries`).
- `supportedExtensions` in `archive.go` is the only definition of what `Extract` can unpack; `Extension`, `IsSupported` and `SupportedExtensions` expose it to installers. Adding a format means adding its suffix there (compound suffix before the bare one it ends with) and a `case` in `Extract`; `TestSupportedExtensionsDispatch` fails when the two disagree. `unsupportedExtensions` names archive suffixes `Extract` recognises but cannot unpack so that callers can refuse them instead of treating them as raw binaries.

## Local gotchas

- Path traversal vulnerabilities in archive headers (Zip Slip) -> sanitize extraction paths with `filepath.Clean`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `archive_test.go`.
- Ask first: adding support for new archive formats.
- Never: allow unsafe relative paths that break out of the target extraction directory, except the symlink targets a mounted `.dmg` volume holds (see Local conventions).

## References

- `pkg/archive/archive.go`
