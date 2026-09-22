# scripts/managed-installer

Source of truth and test harness for the hosted curl-to-bash bootstrap installer script (`install.sh`).

## Commands

- Run all scenario tests: `bash scripts/managed-installer/test.sh all`
- Run a specific scenario test: `bash scripts/managed-installer/test.sh <scenario>` (e.g. `fresh-empty`, `existing-config-only`)
- List available test scenarios: `bash scripts/managed-installer/test.sh list`
- Run scenarios with dist rebuild: `bash scripts/managed-installer/test.sh --rebuild-dist all`
- Run local isolated installer test: `cd test-install && just run`

## Local conventions

- `install.sh` must remain compatible with standard POSIX bash without requiring Bash 4+ or Zsh features.
- `install.sh` is copied to `packages/docs/public/install.sh` during `bun --cwd packages/docs sync` (and `just check`). Never edit `packages/docs/public/install.sh` directly.
- Scenarios in `test.sh` use isolated temporary directories and mock release tarballs to verify installer behavior without touching host dotfiles.
- `install.sh` provisions starter configuration files only when bootstrapping an empty target directory; existing configs are never overwritten unless `--force` is used.

## Local gotchas

- **Sync to docs site:** After updating `install.sh`, run `bun --cwd packages/docs sync` or `just typecheck` to update the published installer asset at `packages/docs/public/install.sh`.
- **Target isolation:** When testing changes manually, use `test-install/` (`cd test-install && just run`) rather than running `install.sh` against your primary dotfiles directory.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Never: publish releases automatically without explicit user authorization.
- Never: modify host `~/.dotfiles` or `~/.local/bin` during tests in `test.sh`.
- Ask first: adding new external tool dependencies or modifying default bootstrap flags in `install.sh`.

## References

- `scripts/managed-installer/install.sh`
- `scripts/managed-installer/test.sh`
- `scripts/managed-installer/fixtures/`
- `test-install/AGENTS.md`
