---
name: typescript-testing
description: TypeScript testing guidelines and patterns. Use when writing, reviewing, or fixing TypeScript tests. Covers test structure, assertions, snapshots, conditional logic restrictions, and test organization patterns.
---

# TypeScript Testing

Mandatory testing guidelines for TypeScript projects using Bun's test runner.

## Test Organization

**Before writing tests:**

- Review adjacent tests in the same `__tests__` directory for patterns and conventions
- Check existing fixtures in `__tests__/fixtures` and reuse whenever possible
- Check for shared testing helpers or package-specific testing utilities
- Reuse existing testing helpers (mocks, factories, utilities) before creating new ones
- Only create new fixtures or helpers when existing ones don't meet the test requirements

**File naming and location:**

- Test files: `*.test.ts` in `__tests__` directory **directly adjacent to the code being tested**
- Fixtures: `fixtures--{purpose}.ts` in `__tests__/fixtures` with `FIXTURE_[SNAKE_CASE]` exports

**Colocation rule:** The `__tests__` directory must be a sibling of the source file(s) it tests. Each directory containing source files should have its own `__tests__` directory.

Example structure:

```
packages/shell-emissions/src/
├── index.ts
├── blocks/
│   ├── BlockBuilder.ts
│   └── __tests__/
│       └── BlockBuilder.test.ts
├── emissions/
│   ├── factories.ts
│   ├── guards.ts
│   └── __tests__/
│       ├── factories.test.ts
│       └── guards.test.ts
└── renderer/
    ├── BlockRenderer.ts
    └── __tests__/
        └── BlockRenderer.test.ts
```

**Key principle:** Navigate from the source file to its test by going into the adjacent `__tests__` directory. Tests for `blocks/BlockBuilder.ts` go in `blocks/__tests__/BlockBuilder.test.ts`, not in a top-level `src/__tests__/` directory.

## Critical Rules

### No Conditional Logic in Tests

**Never use `if`, `else`, `switch`, or ternary operators in tests.** Conditionals create code paths that may skip assertions, leading to false positives.

```typescript
// ❌ BAD: If condition is false, expect() never runs
if (!result.success) {
  expect(result.message).toBe('failed');
}

// ✅ GOOD: assert() narrows type AND guarantees execution
import assert from 'node:assert';
assert(!result.success);
expect(result.message).toBe('failed');
```

Use `assert()` from `node:assert` for type narrowing without conditional execution.

### Exact String Matching

**Always verify complete string content.** Partial matches with `toContain()` or `toMatch()` can miss unexpected content.

```typescript
// ❌ BAD: May contain extra unwanted content
expect(result.message).toContain('Installation failed');
expect(result.message).toMatch(/failed/);

// ✅ GOOD: Verifies exact output
expect(result.message).toMatchInlineSnapshot(`"Installation failed"`);
expect(result.message).toBe('Installation failed');
```

Use `toMatchInlineSnapshot()` for multi-line strings or complex output.

## Strict Prohibitions

- **DO NOT** delete or skip tests to make them pass
- **DO NOT** write tests for testing helpers
- **DO NOT** pipe CLI test commands through `grep`
- **DO NOT** use conditional logic (`if`, `else`, `switch`, ternary)
- **DO NOT** use partial string matches (`toContain`, `toMatch`)

## Test Structure Best Practices

**Arrange-Act-Assert pattern:**

```typescript
describe('myFunction', () => {
  it('should return success when input is valid', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    assert(result.success);
    expect(result.value).toBe('test');
  });
});
```

**Type narrowing with assertions:**

```typescript
// For union types, use assert to narrow before accessing properties
type Result = { success: true; value: string; } | { success: false; error: string; };

const result: Result = functionUnderTest();

// Narrow the type
assert(result.success);

// Now TypeScript knows result.value exists
expect(result.value).toBe('expected');
```

## Common Testing Patterns

**Snapshot testing for formatted output:**

```typescript
expect(formattedOutput).toMatchInlineSnapshot(`
  "line 1
  line 2
  line 3"
`);
```

**Testing error cases:**

```typescript
it('should throw when input is invalid', () => {
  expect(() => myFunction(null)).toThrow('Invalid input');
});
```

**Array and object testing:**

```typescript
// Exact match
expect(result).toEqual({ id: 1, name: 'test' });

// Partial match (when needed)
expect(result).toMatchObject({ name: 'test' });
```

## Running Tests

- Single test file: `bun test [file]`
- All tests: `bun test`
- Update snapshots: `bun test --update-snapshots`
- Lint: `bun lint`

**Task completion requires:**

- All tests passing
- Type checking passing (`bun typecheck`)
- Linting passing (`bun lint`)
- Code formatted (`bun fix`)
