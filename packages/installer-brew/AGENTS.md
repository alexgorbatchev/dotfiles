# @dotfiles/installer-brew

Homebrew installer plugin for formula and cask installs managed externally by Homebrew.

## Commands

- Focused test: `bun test:native packages/installer-brew/src/__tests__/BrewInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep Homebrew-specific policy in `src/BrewInstallerPlugin.ts` and shell invocation details in `src/installFromBrew.ts`.
- Cover both formula and cask flows when changing tap handling, version detection, or externally-managed behavior.

## Local gotchas

- Homebrew installs are externally managed. `.bin()` shims are not the pattern here; let Homebrew own binary placement.

## Boundaries

- Ask first: changing formula/cask semantics or externally-managed metadata returned to callers.
- Never: add shim-generation assumptions for brew-installed tools.

## References

- `README.md`
- `src/BrewInstallerPlugin.ts`
- `src/installFromBrew.ts`
- `src/__tests__/BrewInstallerPlugin--externallyManaged.test.ts`
