# pkg/symlink

Symlink creation and evaluation with backup/overwrite options.

## Commands

- Test: `go test ./pkg/symlink/...`

## Local conventions

- Verify target destinations, handle existing files/folders, and handle overwrite/backup options.

## Local gotchas

- Relative symlink sources resolved against working directory instead of tool config path -> resolve relative sources against `filepath.Dir(tool.ConfigFilePath)`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `symlink_test.go`.
- Ask first: modifying symlink overwrite or backup policies.
- Never: create broken symlinks without checking source path existence.

## References

- `pkg/symlink/symlink.go`
