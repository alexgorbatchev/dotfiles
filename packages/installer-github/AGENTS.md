# @dotfiles/installer-github

GitHub release installer plugin with asset selection, API-client caching, and optional `gh` CLI support.

## Commands

- Focused test: `bun test:native packages/installer-github/src/github-client/__tests__/GitHubApiClient--caching.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep GitHub API-client behavior under `src/github-client/` and install orchestration in `src/installFromGitHubRelease.ts` / `src/GitHubReleaseInstallerPlugin.ts`.
- Asset-pattern and asset-selector behavior are public config contracts; cover both matching and install flow tests when changing them.

## Local gotchas

- This package owns GitHub-specific behavior like `ghCli` fallback. Do not leak those assumptions into generic installer code or Gitea flows.

## Boundaries

- Ask first: changing release discovery, caching semantics, prerelease defaults, or `gh` CLI behavior.
- Never: bypass the API client layer with ad-hoc fetch calls.

## References

- `README.md`
- `src/GitHubReleaseInstallerPlugin.ts`
- `src/installFromGitHubRelease.ts`
- `src/github-client/`
