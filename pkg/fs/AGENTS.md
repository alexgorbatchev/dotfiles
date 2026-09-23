# pkg/fs

Filesystem abstractions (`OSFS`, `MemFS`, `ResolvedFS`, `TrackedFileSystem`).

## Commands

- Test: `go test ./pkg/fs/...`

## Local conventions

- Log `write`, `rm`, `chmod` file operations using `~`-contracted home paths.
- Fall back to host OS filesystem during dry-runs when paths do not exist in `MemFS`.
- Stream contents into a file created through `FS` with `WriteAndClose`, which returns the close error: some write failures surface only when the file is closed, and `trackedFileWriter.Close` is where a tracked file is recorded. `pkg/downloader` and `pkg/updater` are not yet converted (#149).
- Copy a directory tree with `CopyTree` (`copy_tree.go`), which copies like `cp -R` minus extended attributes, resource forks and ACLs (none are copied): symlinks are recreated with their target string (never followed, so a link to a directory or a dangling link copies), regular files go through `CopyFile` and keep their permission bits, and directories keep theirs. A copy that must reproduce a tree exactly (an app bundle, a mounted volume) never walks it and `CopyFile`s or `Open`s each entry, which turns links into copies of their targets or fails on them. The orchestrator's `copyTree` (`pkg/orchestrator/generate_pipeline.go`) follows links on purpose, since a configuration `copy` places the content a link names and records each file through `TrackedFileSystem`.
- Use `ResolvedFS` to expand user home aliases (`~`, `$HOME`, `${HOME}`) and verify absolute paths via `IsAbs()`.

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
