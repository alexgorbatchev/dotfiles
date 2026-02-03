---
name: typescript
description: TypeScript code quality requirements and patterns. Use when writing, reviewing, or modifying TypeScript code. Covers type safety, naming conventions, file organization, module structure, functional programming patterns, and import/export rules.
---

# TypeScript Code Quality

## Prohibited Patterns

- `any` type
- Type casting with `as Type` (exceptions: branded types, DOM elements, test mocks)
- `as any`
- Inline imports or `require()` statements
- Dynamic imports (`await import()`)
- `import * as Foo` or `export * as Foo`
- Renaming imports (`import { Foo as Bar }`)

## File Naming

Filename must match the exact name and casing of the primary exported element:

- Function `createUser` → `createUser.ts`
- Class `UserProfile` → `UserProfile.ts`
- Interface `IUserService` → `IUserService.ts`
- Type `Config` → `Config.ts`

Each file should have a single primary export. If multiple related items are exported, name the file after the most important one.

**Special cases:**

- Constants: `constants.ts`
- Utility collections: `stringUtils.ts`, `dateUtils.ts`
- Type collections: `types.ts` (must not contain implementations)
- Index files: `index.ts` (re-exports public API)
- Tests: `{sourceFileName}.test.ts` in `__tests__/`

## Naming Conventions

| Pattern                | Use For                                   |
| ---------------------- | ----------------------------------------- |
| `camelCase`            | Variables, functions, methods, properties |
| `PascalCase`           | Classes, interfaces, types, enums         |
| `SCREAMING_SNAKE_CASE` | Constants                                 |
| `IInterface`           | Interface names                           |
| `kebab-case`           | CSS classes                               |

### Booleans

Prefix with: `is`, `has`, `can`, `should`, `will`, `does`

```typescript
// ✅
const isValid = true;
const hasPermission = false;

// ❌
const valid = true;
```

### Error Variables

Always use `error`, never `err` or `e`:

```typescript
// ✅
catch (error) { }

// ❌
catch (err) { }
```

### Path Variables

Be consistent within context:

```typescript
// ✅ Consistent
const sourcePath = '/src';
const destinationPath = '/dest';

// ❌ Mixed
const sourcePath = '/src';
const dest = '/dest';
```

### Temporary Variables

Avoid single-use variables:

```typescript
// ✅
console.log(determinePath());

// ❌
const finalPath = determinePath();
console.log(finalPath);
```

## Type Safety

### Extract First, Check Second

```typescript
// ✅
const item = array[0];
if (item) {
  // use item
}

// ❌
array[0] as string;
```

### Type Annotations Over Assertions

```typescript
// ✅
const value: ExpectedType = sourceValue;

// ❌
const value = sourceValue as ExpectedType;
```

### Explicit Return Types

All functions must declare explicit return types:

```typescript
// ✅
function createUser(name: string): UserResult {
  return { id: generateId(), name, createdAt: new Date() };
}

// ❌
function createUser(name: string) {
  return { id: generateId(), name, createdAt: new Date() };
}
```

### Use Existing Types

Variables not from function calls need explicit types. Never inline type definitions:

```typescript
// ✅
type Metadata = { tarballUrl: string; };
type OperationResult = { success: boolean; metadata: Metadata; };
function getResults(): Promise<OperationResult>;

// ❌
function getResults(): Promise<{ success: boolean; metadata: { tarballUrl: string; }; }>;
```

### Type Guards Over Assertions

Use type guard functions for complex/custom types. Built-in type checks (`typeof` for primitives, `Array.isArray`) are fine:

```typescript
// ✅ Type guard for custom types
function isUserProfile(value: unknown): value is UserProfile {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value;
}

if (isUserProfile(data)) {
  // data is typed as UserProfile
}

// ✅ Built-in checks for primitives are fine
if (typeof input === 'string') {}
if (typeof count === 'number') {}
if (Array.isArray(items)) {}
```

## Module Structure

### Index File Requirement

All modules and submodules must re-export their public API through `index.ts` files.

```
src/
├── index.ts           // Re-exports
├── UserService.ts
└── validation/
    ├── index.ts       // Submodule re-exports
    └── emailValidator.ts
```

### Index.ts Export Pattern

Use wildcard exports in index files:

```typescript
// ✅ index.ts
export * from './createUser';
export * from './UserService';
export * from './validation';

// ❌
export { UserService } from './UserService';
```

## Functional Programming

### Pure Functions

Core logic should be implemented as pure functions where possible. A pure function's output must depend only on its explicit input arguments, and it must not cause side effects (e.g., modifying external state, performing I/O).

### Isolate Side Effects

Operations with side effects (e.g., file system access, network requests, direct logging to console/files, reading system env or properties) must be isolated from pure core logic. These side effects should be handled at the "edges" of the application (e.g., in the main entry point, dedicated I/O modules, or specific command handlers).

### Dependency Injection

Functions that orchestrate operations but need to invoke side effects must receive the necessary handlers (e.g., `FileSystem` instance, HTTP client, logger instance) as arguments. No singletons - pass dependencies explicitly. Design for testability - all dependencies should be injectable.

### Configuration

Configuration objects derived from external sources (like environment variables) must be created by pure functions. These functions receive all necessary raw inputs (e.g., an object representing environment variables, system properties) as arguments and should use appropriate validation libraries to parse and transform these inputs into a typed configuration object. This validated configuration object is then created at the application's main entry point and passed down via dependency injection.

## Formatting

- Line length: 120 characters
- No file header comments
- Imports at top of file, before any other code
- Use shortest import path for `@foo/bar` packages
- Use latest TypeScript and ECMAScript features (optional chaining, nullish coalescing, array methods, async/await, toSorted, etc.)
