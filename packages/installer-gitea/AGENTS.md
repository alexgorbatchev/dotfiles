# @dotfiles/installer-gitea

Gitea and Forgejo release installer plugin with per-tool instance URLs and Gitea API v1 support.

## Commands

- Focused test: `bun test:native packages/installer-gitea/src/__tests__/GiteaReleaseInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep API-client behavior and release-asset selection explicit; this package cannot assume GitHub semantics or `gh` CLI support.
- Per-instance behavior belongs in the Gitea client path, not in generic installer helpers.

## Local gotchas

- Each tool provides its own `instanceUrl`. If you try to centralize host assumptions here, you'll break Codeberg and self-hosted installations.

## Boundaries

- Ask first: changing pagination, caching, or instance URL handling.
- Never: copy GitHub-specific API or auth behavior into the Gitea flow.

## References

- `README.md`
- `src/GiteaReleaseInstallerPlugin.ts`
- `src/installFromGiteaRelease.ts`
- `src/matchAssetPattern.ts`
