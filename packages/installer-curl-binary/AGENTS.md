# @dotfiles/installer-curl-binary

Installer plugin for direct binary downloads where the fetched file is the executable, not an archive.

## Commands

- Focused test: `bun test:native packages/installer-curl-binary/src/__tests__/CurlBinaryInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep direct-download logic in `src/installFromCurlBinary.ts` and schema details under `src/schemas/`.
- Version detection arguments and regex handling are part of the public tool-config contract; test them before changing install behavior.

## Local gotchas

- This method does not extract archives. If a tool download needs unpacking, it belongs in `installer-curl-tar`, not here.

## Boundaries

- Ask first: changing executable detection or download-to-binary path semantics.
- Never: add archive extraction behavior to this package.

## References

- `README.md`
- `src/installFromCurlBinary.ts`
- `src/CurlBinaryInstallerPlugin.ts`
- `src/schemas/`
