# pkg/backup

Safe non-destructive file backups and monotonic reservation sequences.

## Commands

- Test: `go test ./pkg/backup/...`

## Local conventions

- Reserve free backup path (`Reserve`): first backup uses `<path>.bak`; subsequent backups use numbered suffixes `<path>.bak.2`, `<path>.bak.3`, etc.
- Reservation search bounds: search stops at `maxAttempts` (1000 attempts) to prevent unbounded loops.
- File and directory support (`Move`): renames whatever occupies `path` (file or entire directory tree) to the reserved backup path, returning the destination path (or empty string if `path` does not exist).
- Injected filesystem: all operations use `fs.FS` (`Lstat`, `Rename`) rather than raw `os` package calls.
- Check existence with `Lstat`: uses `Lstat` rather than `Stat` so that broken symlinks count as occupied and are preserved rather than overwritten.

## Local gotchas

- Overwriting existing `.bak` files destroys the original pre-dotfiles user file -> `Reserve` always finds the next unused `.bak` / `.bak.N` path without deleting previous backups.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `backup_test.go`.
- Ask first: modifying backup file naming conventions or attempt limits.
- Never: overwrite, delete, or truncate existing backup files during reservation or moving.

## References

- `pkg/backup/backup.go`
- `pkg/backup/backup_test.go`
