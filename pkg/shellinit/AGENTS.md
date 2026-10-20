# pkg/shellinit

Shell initialization script generator (main.zsh, main.bash, main.ps1, .once/).

## Commands

- Test: `go test ./pkg/shellinit/...`

## Local conventions

- Generate priority-sorted shell initialization files (`path` > `completion` > `script` > `env` > `command`).
- `FormatPath` moves a directory already on PATH to the front instead of skipping it (macOS `path_helper` reorders PATH in login shells after `~/.zshenv`), and leaves PATH untouched when the directory is already first. The bash/zsh form matches the directory through a quoted variable, never written into `${var/pattern/...}` (a `/` ends the pattern), must work in bash 3.2, and stops its loop when a replacement changes nothing. `TestFormatPathPlacesTheDirectoryFirstInBashAndZsh` runs it in both shells.
- Shell profile injection (`Inject`) only updates profiles that already exist, in place and preserving their permissions (temporarily unlocking read-only files during update or removal). A missing profile is reported with `ErrProfileNotFound` and never created: the file belongs to the user, as in v1's `onlyIfExists` profile update.

## Local gotchas

- Re-running `.once` scripts on every shell launch -> verify `.once` script state marker files before execution.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `shellinit_test.go`.
- Ask first: modifying shell initialization file naming or loading order.
- Never: break priority ordering when generating shell blocks.

## References

- `pkg/shellinit/shellinit.go`
