---
root: false
targets: ["*"]
description: 'testing'
globs:
  - '**/*'
---

# Testing
- **Test Files & Location:** Test files are named `*.test.ts`. They must be stored in a `__tests__` directory located *directly next to the file or module directory they are testing*. For example, tests for `src/module/utils/myUtil.ts` should be in `src/module/utils/__tests__/myUtil.test.ts`. 
- **Test Fixtures:** Test fixtures are named `fixtures.ts` and export constants `FIXTURE_[lowercase_snake_case]`. These fixtures are stored in the `src/module/__tests__/fixtures` directories or if shared project-wide, in a central `src/__tests__/fixtures/` directory.
- **Test Coverage:** Each file must have 100% test coverage. This is enforced by the CI pipeline and the `bun run test` command.
- **Testing Helpers:** Various testing utilities are located in the `src/testing-helpers` directory. Testing helpers don't need to have their own tests.
- **Mocking:**
  - `fetch` must be mocked, typically using the `FetchMockHelper` utility (imported from `@testing-helpers`).
  - All other modules should be passed in as dependencies.
  - When mocking real public API calls, the `curl` command must be use to capture the real API response and must be captured in fixtures. An `express` server must be used to serve the fixtures. 
- **Testing Framework:** The project uses `bun:test` framework and `bun run test {file}` command to run tests.