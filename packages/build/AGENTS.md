# @dotfiles/build

Build and release tooling that produces the publishable `.dist/` package and validates the distributable CLI.

## Commands

- Focused test: `bun test:native packages/build/src/build/__tests__/resolveRuntimeDependencies.test.ts`
- Build distributable: `bun compile`
- Release build: `bun release`

## Local conventions

- Keep orchestration in `src/build/build.ts`, procedural stages in `src/build/steps/`, and reusable utilities in `src/build/helpers/`.
- When dashboard bundling changes, validate both the build step and the built-dashboard smoke test path under `src/build/steps/`.

## Local gotchas

- `.dist/` is generated output. Change sources under `packages/build/src/**`, then rerun `bun compile` instead of editing emitted files.
- Release work is not complete until the matching GitHub release has a filled title/body written with `gh release` from the actual git history since the previous tag.

## Boundaries

- Ask first: changing publish output shape, runtime dependency externalization, or release artifact names.
- Never: hand-edit `.dist/` or bypass the distributable smoke tests.

## References

- `README.md`
- `src/build/build.ts`
- `src/build/steps/`
- `src/build/helpers/`
