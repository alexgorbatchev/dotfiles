# @dotfiles/e2e-test

End-to-end fixture coverage for CLI workflows, generated artifacts, and cross-package integration behavior.

## Commands

- Focused test: `bun test:native packages/e2e-test/src/__tests__/dependency.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep worker isolation intact: generated paths must remain keyed by `BUN_TEST_WORKER_ID` and the helpers in `src/__tests__/helpers/`.
- Use `TestHarness` and the mock-server builders before introducing new fixture or command wrappers.

## Local gotchas

- E2E tests share fixtures inside a worker. Breaking the generated-directory isolation model will cause flaky parallel failures.

## Boundaries

- Ask first: changing fixture layout or mock-server protocols used by multiple tests.
- Never: point automated tests at `test-project-npm/` or `test-project-compiled/`, or remove worker isolation to make tests pass.

## References

- `README.md`
- `src/__tests__/helpers/TestHarness.ts`
- `src/__tests__/helpers/mock-server/`
- `src/__tests__/dependency.test.ts`
