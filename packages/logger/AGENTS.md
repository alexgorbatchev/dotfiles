# @dotfiles/logger

Safe logger wrappers, stack filtering, and test log capture built on top of `tslog`.

## Commands

- Focused test: `bun test:native packages/logger/src/__tests__/SafeLogger--stack-filtering.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- All message templates belong in per-package `log-messages.ts`; this package provides the logger primitives, not call-site-specific copy.
- Keep user-facing stack filtering and trace-mode behavior aligned by updating `filterErrorStack.ts`, `createTsLogger.ts`, and their tests together.

## Local gotchas

- Logging output format is part of test expectations across the repo. Seemingly small formatter changes can break many packages.

## Boundaries

- Ask first: changing default log formatting, stack filtering, or `SafeLogger` semantics.
- Never: reintroduce raw-string logging paths that bypass the safe message types.

## References

- `README.md`
- `src/SafeLogger.ts`
- `src/createTsLogger.ts`
- `src/TestLogger.ts`
- `src/filterErrorStack.ts`
