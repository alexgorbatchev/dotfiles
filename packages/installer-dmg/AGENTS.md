# @dotfiles/installer-dmg

macOS DMG installer plugin for downloading disk images, mounting them, and copying `.app` bundles.

## Commands

- Focused test: `bun test:native packages/installer-dmg/src/__tests__/DmgInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep DMG orchestration in `src/DmgInstallerPlugin.ts` and source validation in `src/schemas/`.
- Cover both GitHub-release and direct-URL source definitions when changing asset selection or mount/copy behavior.

## Local gotchas

- This package is intentionally macOS-specific and silently skips on non-macOS platforms. That behavior is part of the contract.

## Boundaries

- Ask first: changing non-macOS behavior or how `.app` bundles are copied into `/Applications`.
- Never: add shim assumptions for DMG-installed applications.

## References

- `README.md`
- `src/DmgInstallerPlugin.ts`
- `src/installFromDmg.ts`
- `src/schemas/`
