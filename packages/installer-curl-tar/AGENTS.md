# @dotfiles/installer-curl-tar

Installer plugin for tarball downloads that are fetched, extracted, and scanned for binaries.

## Commands

- Focused test: `bun test:native packages/installer-curl-tar/src/__tests__/CurlTarInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep tar-install orchestration in `src/CurlTarInstallerPlugin.ts` and extract-specific behavior in the installer function and schemas.
- When hooks or version detection change, cover both extraction results and final binary-path resolution.

## Local gotchas

- Archive extraction behavior here depends on `@dotfiles/archive-extractor`. If extraction expectations change, update both packages' tests.

## Boundaries

- Ask first: changing hook lifecycle support, extraction assumptions, or binary resolution after unpacking.
- Never: treat a direct binary download as a tar install just to reuse code.

## References

- `README.md`
- `src/CurlTarInstallerPlugin.ts`
- `src/schemas/`
- `src/__tests__/CurlTarInstallerPlugin.test.ts`
