# pkg/installer

Tool installer plugins (github-release, curl-script, cargo, brew, apt, dnf, pacman, pkg, etc.).

## Commands

- Test: `go test ./pkg/installer/...`

## Local conventions

- Log `INFO` progress messages when fetching API releases, downloading assets, and extracting archives.
- Implement installer plugins by satisfying the `Installer` interface in `pkg/installer/installer.go`.

## Local gotchas

- Unlogged network requests or asset downloads look like hung processes -> always log explicit progress steps (`Fetching release info...`, `Downloading...`, `Extracting...`).

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in installer test files for any installer modifications.
- Ask first: adding new installer plugin types or changing installer interface contracts.
- Never: perform silent background downloads without logging progress.

## References

- `pkg/installer/installer.go`
- `pkg/installer/github.go`
