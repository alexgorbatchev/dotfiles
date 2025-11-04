---
description: TypeScript specific testing rules.
applyTo: '**/*'
---
# TypeScript Specific Testing Rules

- DO NOT delete or skip tests to get them to pass.
- DO NOT write tests for testing helpers.
- DO NOT pipe cli test commands through `grep`.
- DO NOT include `if(...)` or any other kind of conditional logic statements in the tests.
- Test files are named `*.test.ts`. They must be stored in a `__tests__` directory located *directly next to the file or package directory they are testing*. For example, tests for `packages/utils/src/myUtil.ts` should be in `packages/utils/src/__tests__/myUtil.test.ts`. 
- Test fixtures be named `fixtures--{purpose}.ts` and export constants `FIXTURE_[lowercase_snake_case]`. These fixtures are stored in package-specific `__tests__/fixtures` directories adjacent to the test files.

## TypeScript Considerations

When having to verify variables that are type unions, you must never use `if(...)` statements because that may results in an invalid test, always use `assert(...)` instead.

```typescript
// ✅ Good - verifies value and provides type inference
import assert from 'node:assert';
assert(!result.success);
expect(result.message).toBe(...);

// ❌ Bad - provides type inference but if true doesn't execute expect()
if(!result.success) {
  expect(result.message).toBe(...);
}
```
