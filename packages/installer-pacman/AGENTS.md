# @dotfiles/installer-pacman

pacman installer plugin for Arch-family Linux package installs managed externally by pacman.

## Commands

- Focused test: `bun test:native packages/installer-pacman/src/__tests__/PacmanInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep pacman-specific policy in `src/PacmanInstallerPlugin.ts` and shell invocation details in `src/installFromPacman.ts`.
- pacman installs are externally managed. The system package manager owns files and PATH placement.
- Use `pacman` for installation and installed version detection.

## Local gotchas

- Root privileges are environment-dependent. Support `.sudo()` via the shared installer sudo helper, but do not invent a separate escalation path.
- Do not add a package-database-only refresh option. If refresh is needed, use `sysupgrade: true` so the command is `pacman -Syu`.

## Boundaries

- Ask first: changing package specification semantics or adding standalone database refresh behavior.
- Never: add shim-generation assumptions for pacman-installed tools.

## References

- `README.md`
- `src/PacmanInstallerPlugin.ts`
- `src/installFromPacman.ts`
- `src/__tests__/PacmanInstallerPlugin.test.ts`
