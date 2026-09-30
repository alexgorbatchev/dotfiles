# pkg/fs

Filesystem abstractions (`OSFS`, `MemFS`, `ResolvedFS`, `TrackedFileSystem`).

## Commands

- Test: `go test ./pkg/fs/...`

## Local conventions

- Log `write`, `rm`, `chmod` file operations using `~`-contracted home paths.
- Control metadata persistence in `TrackedFileSystem` with `WithStoreMetadata`: file writes only store written contents in registry metadata when enabled (used for templates to provide merge ancestors, omitted for copies so credentials and config file contents are never persisted in plain text; copies store content hashes only).
- Control per-entry logging verbosity in `TrackedFileSystem` with `WithSuppressLogging`: demotes per-entry operation logging (`write`, `rm`, `chmod`, `ln`, `ln -s`, `cp`) from INFO to DEBUG. `CopyTree` automatically enables logging suppression for its operations, logging exactly one summary line for the tree at INFO (`cp -R <src> <dest>`) while per-entry operations appear at DEBUG.
- Consolidated directory removal in `TrackedFileSystem.RemoveAll`: logs a single summary line for the directory removed at INFO (`rm <path>`) and demotes individual subpath removals to DEBUG. The recursive directory walk is short-circuited when neither transaction recording (`t.tx != nil && t.reg != nil`) nor debug logging (`t.log != nil && t.log.IsDebug()`) is active.
- Fall back to host OS filesystem during dry-runs when paths do not exist in `MemFS`.
- Stream contents into a file created through `FS` with `WriteAndClose`, which returns the close error: some write failures surface only when the file is closed, and `trackedFileWriter.Close` is where a tracked file is recorded. A failed close (including a tracked file system failing to record the file) is wrapped in `ErrClose`, joined with the copy error when both fail: such a file is treated as holding unknown contents, so a caller that would otherwise keep a partial file (the downloader resuming an interrupted download) removes it instead.
- Copy a directory tree with `CopyTree` (`copy_tree.go`), which copies like `cp -R` minus extended attributes, resource forks and ACLs (none are copied): symlinks are recreated with their target string (never followed, so a link to a directory or a dangling link copies), regular files go through `CopyFile` and keep their permission bits, and directories keep theirs. A copy that must reproduce a tree exactly (an app bundle, a mounted volume) never walks it and `CopyFile`s or `Open`s each entry, which turns links into copies of their targets or fails on them. A configuration `.copy()` does not use `CopyTree`: `drift.CopyMembers` (`pkg/drift/copies.go`) follows links on purpose, since a configuration copy places the content a link names, and the orchestrator settles each member through the drift engine.
- Use `ResolvedFS` to expand user home aliases (`~`, `$HOME`, `${HOME}`) and verify absolute paths via `IsAbs()`.

## Local gotchas

- Dry-run `MemFS` missing host files causes false `Stat`/`Lstat` errors -> fallback to `os.Stat`/`os.Lstat` for reading existing host files in dry-run mode.
- Host fallback covers metadata only, so `Stat` can report a host file that `MemFS.OpenFile` cannot append to -> like `os.OpenFile`, `MemFS.OpenFile` creates a missing file only with `O_CREATE`, and an append to a host-only file fails with `os.ErrNotExist`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `fs_test.go` for any filesystem modifications.
- Ask first: modifying `TrackedFileSystem` registry recording behavior.
- Never: bypass filesystem abstractions with raw `os` package calls or un-tracked direct file operations.

## References

- `pkg/fs/fs.go`
- `pkg/fs/tracked_fs.go`
- `pkg/fs/mem_fs.go`
