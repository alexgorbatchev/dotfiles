---
description: TypeScript specific code quality requirements.
applyTo: '**/*'
---
# TypeScript Code Quality Requirements

--- 

## General Requirements
- `any` type is PROHIBITED
- Line length is 120 characters
- Do not add file header comments
- Type casting is PROHIBITED and absolutely never use `as any`
- Use typeguard functions instead of `as Type`
- Don't use inline imports or require statements

--- 

## File Name Rules
Filenames must match the exact name and casing of the main exported element.
- If exporting a function `createUser`, the file should be `createUser.ts`
- If exporting a class `UserProfile`, the file should be `UserProfile.ts`
- If exporting a type `Config`, the file should be `Config.ts`

--- 

**Edge Cases:**
- **Constants files**: Use `constants.ts` for package-specific constants
- **Utility collections**: Use descriptive names like `stringUtils.ts`, `dateUtils.ts` when exporting multiple related utilities
- **Type collections**: Use `types.ts` for package-specific type collections
- **Index files**: Always named `index.ts` and re-export package's public API
- **Test files**: Use `{sourceFileName}.test.ts` pattern in `__tests__` directories

--- 

## Variable Naming Rules
- **camelCase**: Variables, functions, methods, properties
- **PascalCase**: Classes, interfaces, types, enums
- **SCREAMING_SNAKE_CASE**: Constants
- **IInterface**: Interface names must start with `I`

--- 

## Type Safety Rules

**NEVER use type assertions (`as Type`) when proper type checking is possible.**

### Forbidden Patterns:
```typescript
// ❌ NEVER DO THIS
array[0] as string
obj.prop as SomeType  
value as any
```

### Required Patterns:
```typescript
// ✅ ALWAYS DO THIS
const item = array[0];
if (item) {
  // use item safely
}

// ✅ OR USE PROPER TYPE ANNOTATIONS
const value: ExpectedType = sourceValue; // Let TypeScript validate compatibility
```

### Core Rules:
1. **Extract first, check second**: `const x = array[0]; if (x) { use(x) }`
2. **Use type annotations over assertions**: `const x: Type = value` not `const x = value as Type`
3. **Handle undefined explicitly**: Never assume array elements or object properties exist
4. **Trust the type system**: If TypeScript complains, fix the types, don't silence with `as`

### Exception:
Only use `as` for:
- Branded types: `message as SafeLogMessage`
- DOM elements: `element as HTMLInputElement`
- Test mocks where type system limitations require it

**If you find yourself using `as`, ask: "Can I use proper type checking instead?"**

### Return Value Standards

- **Explicit Return Types**: All functions must declare explicit return types
- **No Inline Object Returns**: Functions must never return `{...}` object literals directly
- **Typed Variable Pattern**: Declare result with explicit type, then return the typed variable

```typescript
// ❌ BAD - Inline object return
function createUser(name: string) {
  return {
    id: generateId(),
    name,
    createdAt: new Date()
  };
}

// ✅ GOOD - Explicit return type and typed variable
function createUser(name: string): UserResult {
  const result: UserResult = {
    id: generateId(),
    name,
    createdAt: new Date()
  };
  return result;
}
```

**Rationale**: Explicit return types and typed variables improve:
- Type safety and compile-time error detection
- Code readability and documentation
- Refactoring safety and IDE support
- Debugging experience with clear variable names

---

## Test File Organization
- Break up large test files into smaller files using `{fileName}--{part}` naming convention.

--- 

## Functional Programming Approach

- **Strive for Pure Functions:** Core logic throughout the application should be implemented as pure functions where possible. A pure function's output must depend *only* on its explicit input arguments, and it must not cause side effects (e.g., modifying external state, performing I/O).
- **Isolate Side Effects:** Operations with side effects (e.g., file system access, network requests, direct logging to console/files, reading system env or properties) must be isolated from pure core logic. These side effects should be handled at the "edges" of the application (e.g., in the main entry point, dedicated I/O modules, or specific command handlers).
- **Dependency Injection for Effects:** Functions that orchestrate operations but need to invoke side effects must receive the necessary handlers (e.g., `FileSystem` instance, HTTP client, logger instance) as arguments.
- **Configuration:** Configuration objects derived from external sources (like environment variables) must be created by pure functions. These functions receive all necessary raw inputs (e.g., an object representing environment variables, system properties) as arguments and should use appropriate validation libraries to parse and transform these inputs into a typed configuration object. This validated configuration object is then created at the application's main entry point and passed down via dependency injection.

--- 

## Import Statements

- All import statements must be placed at the top of the file, before any other code
- Dynamic imports using `await import()` are PROHIBITED
- Require statements are PROHIBITED
- Importing `* as Foo` is PROHIBITED (e.g., `import * as Foo from 'foo'`) 
- Exporting `* as Foo` is PROHIBITED (e.g., `export * as Foo from 'foo'`)
- Renaming import bindings is PROHIBITED (e.g., `import { Foo as Bar } from 'foo'`)
- When editing files with `as Foo` imports, replace them with the actual binding name
- When using `@foo/bar` imports use the shortest path possible (e.g., `@foo/bar` instead of `@foo/bar/baz`)

--- 

## Awlays Use Existing Types
- **Explicit Types Required**: Every declared variable that is not a result of a function call must have an explicit type annotation
- **Function Call Results**: Variables assigned from function calls can rely on type inference
- **Primitive Literals Exception**: String, number, and boolean literals can rely on type inference

```typescript
// ✅ Good
function getResults(): Promise<OperationResults>
function load(record: ID)
const user: UserProfile = { ... };
const user = await fetchUser(id);
const bool = true;
const num = 42;
const str = "hello";

// ❌ Bad
function getResults(): Promise<{ success: boolean }>
function getResults(): Promise<OperationResults & { exitCode: number }>
function load(record: { id: string })
function load(record: ID & { name: string })
const user: UserProfile & { timestamp: number } = { ... };
const user = { ... } as UserProfile;
```

--- 

## Variable Naming Conventions
- **camelCase**: Variables, functions, methods, properties
- **PascalCase**: Classes, interfaces, types, enums
- **SCREAMING_SNAKE_CASE**: Constants
- **kebab-case**: CSS classes

### Boolean Variables

**Required Prefixes**: `is`, `has`, `can`, `should`, `will`, `does`

```typescript
// ✅ Good
const isValid = true;
const hasPermission = false;
const canExecute = checkPermissions();
const shouldContinue = validateInput();
const willUpdate = config.autoUpdate;

// ❌ Bad  
const valid = true;
const permission = false;
const execute = checkPermissions();
```

### Error Variables

**Standard**: Always use `error` (not `err`, `e`, or other abbreviations)

```typescript
// ✅ Good
try {
  // code
} catch (error) {
  logger.error('Operation failed', error);
}

// ❌ Bad
try {
  // code  
} catch (err) { // or (e)
  logger.error('Operation failed', err);
}
```

### Path Variables

**Consistent Suffix Usage**: Use `Path` suffix consistently within same context

```typescript
// ✅ Good - Consistent suffixing
const sourcePath = '/src/file.txt';
const destinationPath = '/dest/file.txt';
const outputPath = '/output/result.txt';

// ✅ Also Good - Consistent no suffix
const source = '/src/file.txt';
const destination = '/dest/file.txt'; 
const output = '/output/result.txt';

// ❌ Bad - Mixed patterns
const sourcePath = '/src/file.txt';
const dest = '/dest/file.txt';
```

### Temporary Variables
Avoid defining single use variables.

```typescript
// ✅ Good
console.log(determinePath());

// ❌ Bad
const finalBinaryPathCurl = determinePath();
console.log(finalBinaryPathCurl);
```

---

## Stongest Type Possible

**Clear and unambiguous**: The type definitions must be clear and unambigous without deeply nested extends or Use the strongest type possible to make the code clear and unambiguous. 
**Use type guards**: Instead of using `typeof`, `instanceof` or `if` checks, use type guard functions to validate types.
**Use Strongest Type Possible**: Instead of a single type with multiple possible values you must use generics to define the possible values.

```typescript
// ✅ Good
type Metadata = { tarballUrl: string; };
type ReturnType = { success: boolean; metadata: Metadata; };

// ❌ Bad
type ReturnType = { success: boolean; metadata: { tarballUrl: string; } };
```

---

## Module Import Rules

- **Index File Requirement**: All modules and submodules must re-export their public API through `index.ts` files
- **Submodule Index Files**: When a submodule exports functionality, it must have its own `index.ts` file
- **Module Path Imports Only**: All imports must only import from the module path, never from subpaths
- **No Deep Imports**: Importing directly from submodules or specific files within a module is prohibited

```typescript
// ✅ Good - Import from module path
import { UserService, createUser } from '@modules/user';
import { Logger } from '@modules/logger';

// ❌ Bad - Deep imports from subpaths
import { UserService } from '@modules/user/UserService';
import { createUser } from '@modules/user/utils/createUser';
```

**Package Structure Example**:
```
packages/user/
├── src/
│   ├── index.ts              // Re-exports main user functionality
│   ├── UserService.ts
│   ├── createUser.ts
│   ├── validation/
│   │   ├── index.ts          // Re-exports validation utilities
│   │   ├── emailValidator.ts
│   │   └── passwordValidator.ts
│   └── email/
│       ├── index.ts          // Re-exports email functionality
│       ├── EmailService.ts
│       └── templates.ts
├── __tests__/
├── package.json
└── tsconfig.json
```

---

## Index File Export Rules

- **Index.ts Files**: `index.ts` files can use `export *` statements to re-export package contents
- **Wildcard Exports Allowed**: `export * from './module'` is permitted in `index.ts` files only
- **Named Exports Preferred**: When possible, prefer explicit named exports for better IDE support
- **Submodule Exports**: Parent package index files should re-export submodule functionality

```typescript
// ✅ Good - main package index.ts
export * from './UserService';
export * from './createUser';
export * from './validation';  // Re-exports from submodule
export * from './email';       // Re-exports from submodule

// ✅ Good - submodule index.ts (src/validation/index.ts)
export * from './emailValidator';
export * from './passwordValidator';

// ❌ Bad 
export { UserService } from './UserService';
export { createUser, updateUser } from './userUtils';
export { ValidationUtils } from './validation';
export type { User, UserConfig } from './types';
```
