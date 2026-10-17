# pkg/venv

Virtual environment manager.

## Commands

- Test: `go test ./pkg/venv/...`

## Local conventions

- Create and manage virtual environment activation scripts.
- Virtual environment activation (`source` / `source.ps1`) uses `dotfiles` on `PATH` if available, or auto-bootstraps `dotfiles` into `$DOTFILES_ENV_DIR` via `install.sh` (`INSTALL_DIR=$DOTFILES_ENV_DIR DOTFILES_YES=1`), generates `.generated/` if missing, prepends `user-bin` to `PATH`, sources `.generated/shell-scripts/main.<zsh|bash|ps1>`, and restores `PATH` and `XDG_CONFIG_HOME` on `dotfiles-deactivate`.

## Local gotchas

- Relative path resolution in virtual environment config -> use `configFileDir` variable interpolation.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `venv_test.go`.
- Ask first: changing virtual environment layout or activation commands.
- Never: modify active user shell environment variables directly.

## References

- `pkg/venv/venv.go`
