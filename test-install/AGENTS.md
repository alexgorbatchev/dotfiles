# test-install

Isolated workspace for testing `scripts/managed-installer/install.sh` and end-to-end bootstrap flows on a local machine without modifying global dotfiles or system directories.

## Commands

- Run isolated install test: `just` (or `just run` inside `test-install/`)
- Clean isolated output: `just clean` (or `rm -rf .output`)

## Local conventions

- All runtime installation outputs (binary, generated shims, shell scripts, config, SQLite database) must be placed inside `test-install/.output/`.
- Never write runtime files outside `.output/` to ensure cleanup is as simple as `rm -rf .output`.
- Keep tool test configurations under `test-install/tools/`.

## Local gotchas

- Running `just` in `test-install/` automatically re-compiles `.dist/dotfiles` first to ensure the installer runs against current Go source code.
- `.output/` is ignored by `.gitignore` to prevent committing generated test outputs.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: ensure all generated files are contained within `.output/`.
- Ask first: adding dependencies or modifying `install.sh` default behavior.
- Never: modify `~/.local/bin` or main system directories from this workspace.

## References

- `test-install/Justfile`
- `test-install/tools/fzf.tool.ts`
- `scripts/managed-installer/install.sh`
