# @dotfiles/installer-manual

Installer plugin for tools that are already present or intentionally managed outside automated installers.

## Commands

- Focused test: `bun test:native packages/installer-manual/src/__tests__/ManualInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep manual-install policy in `src/ManualInstallerPlugin.ts` and lightweight execution behavior in `src/installManually.ts`.
- Use this package for explicit manual/external setups; if an install can be automated reliably, it belongs in a dedicated installer plugin.

## Local gotchas

- Manual does not mean schema-free or behavior-free. The package still defines explicit install metadata and version detection expectations.

## Boundaries

- Ask first: broadening manual behavior beyond existing externally managed and already-installed cases.
- Never: hide real installer logic behind the manual method to skip validation.

## References

- `README.md`
- `src/ManualInstallerPlugin.ts`
- `src/installManually.ts`
- `src/schemas/`
