# @dotfiles/installer-npm

npm installer plugin for globally installing tool packages with `npm` or `bun` package-manager backends.

## Commands

- Focused test: `bun test:native packages/installer-npm/src/__tests__/NpmInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep package-manager orchestration in `src/NpmInstallerPlugin.ts` and shell execution details in `src/installFromNpm.ts`.
- Version resolution and update checks must follow the selected package manager together: use `npm view` for `packageManager: 'npm'` and `bun info` for `packageManager: 'bun'`, so install, update, and check-updates stay aligned.

## Local gotchas

- This plugin is externally managed. Global package-manager installs own binary placement, so do not model it like shim-managed installers.

## Boundaries

- Ask first: changing package-manager selection defaults or global-bin resolution behavior.
- Never: add shim assumptions or bypass schema validation for package specs.

## References

- `src/NpmInstallerPlugin.ts`
- `src/installFromNpm.ts`
- `src/schemas/`
- `src/__tests__/NpmInstallerPlugin.test.ts`
