# @dotfiles/generator-orchestrator

Co-ordinates shell init, shim, and symlink generation and records the generated artifact manifest.

## Commands

- Focused test: `bun test:native packages/generator-orchestrator/src/__tests__/GeneratorOrchestrator.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep orchestration order and cleanup policy in `src/GeneratorOrchestrator.ts`; generator-specific logic belongs in the generator packages.
- When dependency ordering changes, update `orderToolConfigsByDependencies` coverage before changing generation flow.

## Local gotchas

- Cleanup behavior is part of the contract. Regressions here leave stale shims and symlinks behind even if generation succeeds.

## Boundaries

- Ask first: changing generation order, stale-artifact cleanup, or manifest shape.
- Never: duplicate shell/shim/symlink logic here instead of using the dedicated packages.

## References

- `README.md`
- `src/GeneratorOrchestrator.ts`
- `src/__tests__/GeneratorOrchestrator--stale-symlink-cleanup.test.ts`
- `src/orderToolConfigsByDependencies.ts`
