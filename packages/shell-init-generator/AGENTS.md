# @dotfiles/shell-init-generator

Shell-init generation, completion handling, and profile-updater integration for zsh, bash, and PowerShell.

## Commands

- Focused test: `bun test:native packages/shell-init-generator/src/__tests__/ShellInitGenerator.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep shell-agnostic orchestration in `src/ShellInitGenerator.ts`, shell-specific generation under `src/shell-generators/`, and profile-file mutations under `src/profile-updater/`.
- Use the existing BaseShellGenerator/StringProducer split when adding shell-specific behavior instead of cloning generator logic.

## Local gotchas

- Profile updates are intentionally additive and idempotent. Do not rewrite user profile files when a source-line append is sufficient.

## Boundaries

- Ask first: changing profile update semantics, generated script layout, or shell support.
- Never: put shell-specific string formatting into the emission model or bypass duplicate source-line detection.

## References

- `README.md`
- `src/ShellInitGenerator.ts`
- `src/shell-generators/README.md`
- `src/profile-updater/README.md`
