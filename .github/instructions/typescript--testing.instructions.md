---
description: TypeScript specific testing rules.
applyTo: '**/*'
---
# TypeScript Specific Testing Rules

- Never delete tests to get them to pass.
- Test files are named `*.test.ts`. They must be stored in a `__tests__` directory located *directly next to the file or package directory they are testing*. For example, tests for `packages/utils/src/myUtil.ts` should be in `packages/utils/src/__tests__/myUtil.test.ts`. 
- Test fixtures be named `fixtures--{purpose}.ts` and export constants `FIXTURE_[lowercase_snake_case]`. These fixtures are stored in package-specific `__tests__/fixtures` directories or if shared project-wide, in the `@dotfiles/testing-helpers` package.
- Each file must have full test coverage.
- Testing helpers and utilities don't need to have their own tests.
