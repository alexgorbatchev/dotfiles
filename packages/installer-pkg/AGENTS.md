# @dotfiles/installer-pkg

macOS pkg installer plugin for downloading installer packages, invoking `installer`, and resolving post-install binaries.

## Commands

- Focused test: `bun test:native packages/installer-pkg/src/__tests__/PkgInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep pkg orchestration in `src/PkgInstallerPlugin.ts` and `src/installFromPkg.ts`.
- Cover direct URL, GitHub release, and non-macOS skip behavior when changing install flow.

## Local gotchas

- `.pkg` installs are externally managed, so binary paths must be resolved from the system after installation.

## Boundaries

- Ask first: changing non-macOS skip behavior or adding privilege-escalation behavior.
- Never: assume installed binaries live under the managed staging directory.
