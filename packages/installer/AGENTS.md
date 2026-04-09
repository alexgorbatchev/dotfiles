# @dotfiles/installer

Installer orchestration, shared install utilities, lifecycle hooks, and remote-client support used by installer plugins.

## Commands

- Focused test: `bun test:native packages/installer/src/__tests__/Installer--install.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep shared install flows in `src/Installer.ts`, hook lifecycle logic under `src/hooks/`, and install context/state helpers under `src/context/` and `src/state/`.
- Put cross-cutting install utilities in `src/utils/`; do not duplicate installer orchestration in plugin packages.

## Local gotchas

- Hook execution and installer recursion guards are behavioral contracts. Reproduce failures with tests before touching the orchestration path.

## Boundaries

- Ask first: changing hook context shapes, install result contracts, or client API behavior used by plugin packages.
- Never: bypass shared install error handling or duplicate plugin-specific logic in the core installer.

## References

- `README.md`
- `src/Installer.ts`
- `src/hooks/HookLifecycle.ts`
- `src/context/`
- `src/state/`
- `src/__tests__/Installer--install.test.ts`
