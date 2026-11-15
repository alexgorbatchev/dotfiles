# scripts/managed-installer

Source of truth and test harness for the hosted curl-to-bash bootstrap installer script (`install.sh`).

## Commands

- Run all scenario tests: `bash scripts/managed-installer/test.sh all`
- Run a specific scenario test: `bash scripts/managed-installer/test.sh <scenario>` (e.g. `fresh-empty`, `existing-config-only`)
- List available test scenarios: `bash scripts/managed-installer/test.sh list`
- Run scenarios with dist rebuild: `bash scripts/managed-installer/test.sh --rebuild-dist all`
- Run download integrity tests without a dist build: `bash scripts/managed-installer/test.sh download-checksums` (also part of the Go script test suite)
- Run local isolated installer test: `cd test-install && just run`

## Local conventions

- `install.sh` must remain compatible with standard POSIX bash without requiring Bash 4+ or Zsh features.
- `install.sh` is copied to `packages/docs/public/install.sh` during a docs build. Validation uses the copied docs workspace from `packages/docs/workspace.ts` and never syncs into the developer's site output. Never edit `packages/docs/public/install.sh` directly.
- Scenarios in `test.sh` use isolated temporary directories and mock release tarballs to verify installer behavior without touching host dotfiles.
- Each legacy fixture scenario runs in its own subshell with EXIT and signal cleanup; remove only its allocated workspace, and preserve it when `--keep` was explicitly requested. Go fixture processes clear `BASH_ENV` so host startup scripts cannot replace their mock commands.
- `install.sh` provisions starter configuration files only when bootstrapping an empty target directory; existing configs are never overwritten.
- Downloaded bootstrap archives must match exactly one valid SHA-256 entry in `checksums.txt` from the same resolved release before extraction or execution. Verification uses `sha256sum` or `shasum`, and any missing/invalid metadata, verifier failure or mismatch fails closed. The explicit executable `DOTFILES_BINARY_PATH` override remains caller-provided input.

## Local gotchas

- **Docs validation:** After updating `install.sh`, use `just typecheck` to validate the copied docs workspace. Only an intentional docs build updates the published installer asset; validation must leave existing output untouched.
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
