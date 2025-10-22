---
description: TypeScript specific code quality requirements.
applyTo: '**/*'
---
# TypeScript Code Quality Requirements

## General Requirements

- `any` type is PROHIBITED
- Line length is 120 characters
- Do not add file header comments
- Type casting is PROHIBITED and absolutely never use `as any`
- Use typeguard functions instead of `as Type`

## File Name Rules
Filenames must match the exact name and casing of the main exported element.
- If exporting a function `createUser`, the file should be `createUser.ts`
- If exporting a class `UserProfile`, the file should be `UserProfile.ts`
- If exporting a type `Config`, the file should be `Config.ts`

**Edge Cases:**
- **Constants files**: Use `constants.ts` for module-specific constants or follow project structure guidelines
- **Utility collections**: Use descriptive names like `stringUtils.ts`, `dateUtils.ts` when exporting multiple related utilities
- **Type collections**: Use `types.ts` for module-specific type collections (project-wide types go in `src/types/`)
- **Index files**: Always named `index.ts` and re-export module's public API
- **Test files**: Use `{sourceFileName}.test.ts` pattern in `__tests__` directories

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

## Test File Organization

- Break up large test files into smaller files using `{fileName}--{part}` naming convention.

## Functional Programming Approach

- **Strive for Pure Functions:** Core logic throughout the application should be implemented as pure functions where possible. A pure function's output must depend *only* on its explicit input arguments, and it must not cause side effects (e.g., modifying external state, performing I/O).
- **Isolate Side Effects:** Operations with side effects (e.g., file system access, network requests, direct logging to console/files, reading system env or properties) must be isolated from pure core logic. These side effects should be handled at the "edges" of the application (e.g., in the main entry point, dedicated I/O modules, or specific command handlers).
- **Dependency Injection for Effects:** Functions that orchestrate operations but need to invoke side effects must receive the necessary handlers (e.g., `FileSystem` instance, HTTP client, logger instance) as arguments.
- **Configuration:** Configuration objects derived from external sources (like environment variables) must be created by pure functions. These functions receive all necessary raw inputs (e.g., an object representing environment variables, system properties) as arguments and should use appropriate validation libraries to parse and transform these inputs into a typed configuration object. This validated configuration object is then created at the application's main entry point and passed down via dependency injection.

## Import Statements

- All import statements must be placed at the top of the file, before any other code
- Dynamic imports using `await import()` are PROHIBITED
- Do not rename import bindings
- When editing files with `as Foo` imports, replace them with the actual binding name
- When using `@foo/bar` imports use the shortest path possible (e.g., `@foo/bar` instead of `@foo/bar/baz`)

## Variable Types

- **camelCase**: Variables, functions, methods, properties
- **PascalCase**: Classes, interfaces, types, enums
- **SCREAMING_SNAKE_CASE**: Constants
- **kebab-case**: CSS classes

## Variable Type Annotations

- **Explicit Types Required**: Every declared variable that is not a result of a function call must have an explicit type annotation
- **Function Call Results**: Variables assigned from function calls can rely on type inference
- **Primitive Literals Exception**: String, number, and boolean literals can rely on type inference

```typescript
// ✅ Good - Strings, booleans and numbers can use inference
const userName = 'john';
const userAge = 25;
const isActive = true;

// ✅ Good - Explicit types for complex declarations
const items: string[] = [];
const config: AppConfig = {};
const result: PatternResult = {
  systemPattern,
  cpuPattern,
  variantPattern,
};

// ✅ Good - Function calls can use inference
const result = calculateTotal(items);
const user = await fetchUser(id);
const data = JSON.parse(response);

// ❌ Bad - Missing type annotations for complex declarations
const items = [];
const config = {};
const result = {
  systemPattern,
  cpuPattern,
  variantPattern,
};
```

**Specific Requirements**:
- **Object literals**: Must have explicit type annotations (e.g., `const obj: MyType = { ... }`)
- **Array literals**: Must have explicit type annotations (e.g., `const arr: string[] = []`)
- **Complex expressions**: Any non-primitive assignment must include type annotation

**Rationale**: Explicit type annotations for non-function-call variables improve:
- Code readability and self-documentation
- Type safety and compile-time error detection
- IDE support and autocomplete accuracy
- Easier refactoring and maintenance

**Enforcement**: When working with existing code that violates this standard, ALL violations in the file must be corrected during any modification session.

## Boolean Variables

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

## Path Variables

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

## Temporary Variables

**Avoid Copy-Paste Artifacts**: Remove method-specific suffixes from shared variable names

```typescript
// ❌ Bad - Copy-paste artifacts
const finalBinaryPathCurl = determinePath();
const finalBinaryPathTar = determinePath();

// ✅ Good - Clean naming
const finalBinaryPath = determinePath();
```

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
import { Logger } from '@modules/logger/Logger';
import { validateEmail } from '@modules/user/validation/emailValidator';
```

**Module Structure Example**:
```
src/modules/user/
├── index.ts              // Re-exports main user functionality
├── UserService.ts
├── createUser.ts
├── validation/
│   ├── index.ts          // Re-exports validation utilities
│   ├── emailValidator.ts
│   └── passwordValidator.ts
└── email/
    ├── index.ts          // Re-exports email functionality
    ├── EmailService.ts
    └── templates.ts
```

## Index File Export Rules

- **Index.ts Files**: `index.ts` files can use `export *` statements to re-export module contents
- **Wildcard Exports Allowed**: `export * from './module'` is permitted in `index.ts` files only
- **Named Exports Preferred**: When possible, prefer explicit named exports for better IDE support
- **Submodule Exports**: Parent module index files should re-export submodule functionality

```typescript
// ✅ Good - main module index.ts
export * from './UserService';
export * from './createUser';
export * from './validation';  // Re-exports from submodule
export * from './email';       // Re-exports from submodule

// ✅ Good - submodule index.ts (validation/index.ts)
export * from './emailValidator';
export * from './passwordValidator';

// ❌ Bad 
export { UserService } from './UserService';
export { createUser, updateUser } from './userUtils';
export { ValidationUtils } from './validation';
export type { User, UserConfig } from './types';
```

## Project Analysis and Tooling

- Use TypeScript tool calling to access LSP-based project analysis for the current codebase
- Leverage TypeScript tooling to understand project structure, types, and dependencies before making changes

## ENFORCEMENT

When working with existing code that violates this standard, ALL violations in the file must be corrected during any modification session.
