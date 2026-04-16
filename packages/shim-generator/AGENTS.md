# @dotfiles/shim-generator

Executable shim generation for installed tools, including auto-install and usage-tracking behavior.

## Commands

- Focused test: `bun test:native packages/shim-generator/src/__tests__/ShimGenerator.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep shim script generation in `src/ShimGenerator.ts`; generated wrapper behavior is user-facing CLI surface and must stay test-covered.
- Preserve recursion guards, update dispatch, and usage-tracking semantics when changing shim script templates.

## Local gotchas

- Shim scripts are executable product output. Template regressions can brick tool execution even if TypeScript compiles cleanly.

## Boundaries

- Ask first: changing shim invocation contract, append-only usage-log behavior, or current-symlink assumptions.
- Never: mix installer logic directly into generator orchestration when the shim template should own the behavior.

## References

- `README.md`
- `src/ShimGenerator.ts`
- `src/IShimGenerator.ts`
- `src/__tests__/ShimGenerator.test.ts`
