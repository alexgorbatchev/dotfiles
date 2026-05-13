# @dotfiles/installer-apt

APT installer plugin for Debian-family Linux package installs managed externally by APT.

## Commands

- Focused test: `bun test:native packages/installer-apt/src/__tests__/AptInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep APT-specific policy in `src/AptInstallerPlugin.ts` and shell invocation details in `src/installFromApt.ts`.
- APT installs are externally managed. The system package manager owns files and PATH placement.
- Use `apt-get` for installation and `dpkg-query` for installed version detection.

## Local gotchas

- Root privileges are environment-dependent. Support `.sudo()` via the shared installer sudo helper, but do not invent a separate escalation path.
- Do not run `apt-get update` unless the tool config opts into it with `update: true`.

## Boundaries

- Ask first: changing package specification semantics or making `apt-get update` implicit.
- Never: add shim-generation assumptions for APT-installed tools.

## References

- `README.md`
- `src/AptInstallerPlugin.ts`
- `src/installFromApt.ts`
- `src/__tests__/AptInstallerPlugin.test.ts`
