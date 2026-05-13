# @dotfiles/installer-dnf

DNF installer plugin for RPM-family Linux package installs managed externally by DNF.

## Commands

- Focused test: `bun test:native packages/installer-dnf/src/__tests__/DnfInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep DNF-specific policy in `src/DnfInstallerPlugin.ts` and shell invocation details in `src/installFromDnf.ts`.
- DNF installs are externally managed. The system package manager owns files and PATH placement.
- Use `dnf` for installation and `rpm` for installed version detection.

## Local gotchas

- Root privileges are environment-dependent. Support `.sudo()` via the shared installer sudo helper, but do not invent a separate escalation path.
- Do not refresh metadata unless the tool config opts into it with `refresh: true`.

## Boundaries

- Ask first: changing package specification semantics or making metadata refresh implicit.
- Never: add shim-generation assumptions for DNF-installed tools.

## References

- `README.md`
- `src/DnfInstallerPlugin.ts`
- `src/installFromDnf.ts`
- `src/__tests__/DnfInstallerPlugin.test.ts`
