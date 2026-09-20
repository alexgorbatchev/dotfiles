# pkg/github

Shared GitHub API token resolution and authentication utilities.

## Commands

- Test: `go test ./pkg/github/...`

## Local conventions

- Canonical token resolution (`Token`): resolves GitHub tokens in priority order:
  1. Configured token arguments (e.g. tool-specific `token` parameter, project-level `github.token`).
  2. `GITHUB_TOKEN` environment variable.
  3. `GH_TOKEN` environment variable (read by GitHub CLI `gh`).
- Context isolation: callers pass only the configuration they own (e.g. self-updater passes no configured token because project `github.token` may belong to an enterprise host while self-updater targets the public GitHub API).

## Local gotchas

- Explicit configuration in `dotfiles.config.ts` or tool configuration files always overrides ambient shell environment variables (`GITHUB_TOKEN`, `GH_TOKEN`).

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `token_test.go` for any changes to token resolution.
- Ask first: changing token evaluation precedence or adding new credential sources.
- Never: hardcode fallback GitHub API tokens or log raw authorization secrets to output.

## References

- `pkg/github/token.go`
- `pkg/github/token_test.go`
