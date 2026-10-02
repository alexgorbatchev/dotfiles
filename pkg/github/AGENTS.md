# pkg/github

Shared GitHub API token resolution and authentication utilities.

## Commands

- Test: `go test ./pkg/github/...`

## Local conventions

- Canonical token resolution (`Token`): resolves GitHub tokens in priority order following the `gh` CLI convention:
  1. Configured token arguments (e.g. tool-specific `token` parameter, project-level `github.token`).
  2. For `github.com` (including `api.github.com`), `*.ghe.com`, or empty host (default): `GH_TOKEN`, then `GITHUB_TOKEN` environment variables.
  3. For any other host (such as GitHub Enterprise Server): `GH_ENTERPRISE_TOKEN`, then `GITHUB_ENTERPRISE_TOKEN` environment variables.
- Context isolation: callers pass their target host and only the configuration they own (e.g. self-updater targets the public GitHub API and passes no configured token because project `github.token` belongs to `github.host`).
- Current remote contents fetching (`FetchContent`) still queries the GitHub repository contents API and falls back to `gh api`. Its direct API requests and automatic CLI fallback conflict with the root GitHub fetching policy. Replace its default transport before reuse, use the shared `pkg/downloader` infrastructure for non-API file downloads, and require explicit enterprise opt-in before using the `gh` CLI.

## Local gotchas

- Explicit configuration in `dotfiles.config.ts` or tool configuration files always overrides ambient shell environment variables (`GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`).

## Boundaries

- Always: follow the root [GitHub fetching policy](../../AGENTS.md#shared-boundaries): non-API access by default, explicit enterprise `gh` CLI opt-in, and no direct API requests or automatic CLI/API fallbacks. Existing helpers must satisfy these transport boundaries before reuse.
- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `token_test.go` for any changes to token resolution.
- Ask first: changing token evaluation precedence or adding new credential sources.
- Never: hardcode fallback GitHub API tokens or log raw authorization secrets to output.

## References

- `pkg/github/token.go`
- `pkg/github/token_test.go`
- `pkg/github/content.go`
- `pkg/github/content_test.go`
