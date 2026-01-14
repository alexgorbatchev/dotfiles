---
description: Mandatory instructions for working with TypeScript tests.
applyTo: '**/*'
---

# Mandatory TypeScript Testing Instructions

When writing tests for this TypeScript project, you MUST adhere to the following guidelines to ensure consistency, reliability, and maintainability of the test suite.

## Guidelines

- DO NOT delete or skip tests to get them to pass.
- DO NOT write tests for testing helpers.
- DO NOT pipe cli test commands through `grep`.
- Test files are named `*.test.ts`. They must be stored in a `__tests__` directory located _directly next to the file or package directory they are testing_. For example, tests for `packages/utils/src/myUtil.ts` should be in `packages/utils/src/__tests__/myUtil.test.ts`.
- Test fixtures be named `fixtures--{purpose}.ts` and export constants `FIXTURE_[lowercase_snake_case]`. These fixtures are stored in package-specific `__tests__/fixtures` directories adjacent to the test files.

### DO NOT include `if(...)` or any other kind of conditional logic statements in the tests

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

### Use toMatchInlineSnapshot (or similar) to verify static string content

Partial string matches using `toContain` or regex matches using `toMatch` are not allowed as they may lead to false positives if the string contains extra unexpected content. Always verify exact string values using `toMatchInlineSnapshot` or `toBe`.

```typescript
// ✅ Good - verifies exact string value
expect(result.message).toMatchInlineSnapshot(`
value
`);

// ❌ Bad - result.message may also contain extra content
expect(result.message).toContaint('value');

// ❌ Bad - result.message may also contain extra content
expect(result.message.match(/value/)).toBeTruthy();
```
