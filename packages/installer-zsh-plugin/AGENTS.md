# @dotfiles/installer-zsh-plugin

Installer plugin for cloning zsh plugin repositories into the configured plugins directory.

## Commands

- Focused test: `bun test:native packages/installer-zsh-plugin/src/__tests__/ZshPluginInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep clone/install behavior in `src/installFromZshPlugin.ts` and repo/url validation in `src/schemas/`.
- This package manages plugin source checkout, not shell init generation; shell sourcing belongs in the consuming tool config or shell generators.

## Local gotchas

- A zsh plugin install is not a general binary installer. Do not add `.bin()`-style assumptions here.

## Boundaries

- Ask first: changing repository resolution, checkout layout, or plugin-directory defaults.
- Never: blur the boundary between plugin checkout and shell initialization.

## References

- `README.md`
- `src/ZshPluginInstallerPlugin.ts`
- `src/installFromZshPlugin.ts`
- `src/schemas/`
