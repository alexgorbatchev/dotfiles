# @dotfiles/installer-cargo

Cargo installer plugin for Rust tools distributed through cargo-quickinstall or GitHub releases.

## Commands

- Focused test: `bun test:native packages/installer-cargo/src/__tests__/CargoInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep plugin orchestration in `src/CargoInstallerPlugin.ts` and Zod definitions under `src/schemas/`.
- When version-source or binary-source behavior changes, update the schema tests and plugin tests together.

## Local gotchas

- This plugin mixes registry metadata with release-asset downloads. Source-selection bugs usually need coverage for both version resolution and binary acquisition.

## Boundaries

- Ask first: changing default version sources, binary sources, or crate-to-repo resolution behavior.
- Never: bypass schema validation for source-specific parameters.

## References

- `README.md`
- `src/CargoInstallerPlugin.ts`
- `src/schemas/`
- `src/__tests__/CargoInstallerPlugin.test.ts`
