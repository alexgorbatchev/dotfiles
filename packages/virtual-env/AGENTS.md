# @dotfiles/virtual-env

Project-scoped virtual environments for dotfiles configs, activation scripts, and environment-local tool directories.

## Commands

- Focused test: `bun test:native packages/virtual-env/src/__tests__/generateDefaultConfig.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep activation-script generation in `src/generateSourceScript.ts` / `src/generatePowerShellSourceScript.ts` and environment orchestration in `src/VirtualEnvManager.ts`.
- Default config generation belongs in `src/generateDefaultConfig.ts`; keep the emitted structure aligned with CLI config-resolution behavior.

## Local gotchas

- Environment activation relies on `DOTFILES_ENV_DIR` and `DOTFILES_ENV_NAME`. If those names or defaults change, CLI resolution must change with them.

## Boundaries

- Ask first: changing environment layout, activation variable names, or default config content shape.
- Never: make activation scripts mutate unrelated user shell state.

## References

- `README.md`
- `src/VirtualEnvManager.ts`
- `src/generateSourceScript.ts`
- `src/generateDefaultConfig.ts`
- `src/constants.ts`
