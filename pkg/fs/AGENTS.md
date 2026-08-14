# pkg/fs

Filesystem abstractions (`OSFS`, `MemFS`, `ResolvedFS`, `TrackedFileSystem`).

## Commands

- Test: `go test ./pkg/fs/...`

## Local conventions

- Log `write`, `rm`, `chmod` file operations using `~`-contracted home paths.
- Fall back to host OS filesystem during dry-runs when paths do not exist in `MemFS`.

## Local gotchas

- Dry-run `MemFS` missing host files causes false `Stat`/`Lstat` errors -> fallback to `os.Stat`/`os.Lstat` for reading existing host files in dry-run mode.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `fs_test.go` for any filesystem modifications.
- Ask first: modifying `TrackedFileSystem` registry recording behavior.
- Never: bypass filesystem abstractions with raw `os` package calls or un-tracked direct file operations.

## References

- `pkg/fs/fs.go`
- `pkg/fs/tracked_fs.go`
- `pkg/fs/mem_fs.go`
