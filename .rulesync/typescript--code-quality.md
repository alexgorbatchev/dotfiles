---
root: false
targets: ["*"]
description: TypeScript specific code quality requirements.
globs:
  - '**/*'
---

# TypeScript Code Quality Requirements

## General Requirements

- `any` type is not allowed.
- Line length is 120 characters.
- Do not add file header comments.
- Avoid type casting at all costs and absolutely never use `as any`.
- Write JSDoc comments and keep them updated as implementation evolves (including single-line JSDoc like `/** comment */`).
- Avoid using `typeof`, declare types explicitly.

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

## File Size and Organization

- Files should be small and focused on a single responsibility.
- If a file is too large, it should be broken down into smaller files. Try to keep files under 200 lines of code.
- Break up large test files into smaller files using `{fileName}--{part}` naming convention.

## Functional Programming Approach

- **Strive for Pure Functions:** Core logic throughout the application should be implemented as pure functions where possible. A pure function's output must depend *only* on its explicit input arguments, and it must not cause side effects (e.g., modifying external state, performing I/O).
- **Isolate Side Effects:** Operations with side effects (e.g., file system access, network requests, direct logging to console/files, reading system env or properties) must be isolated from pure core logic. These side effects should be handled at the "edges" of the application (e.g., in the main entry point, dedicated I/O modules, or specific command handlers).
- **Dependency Injection for Effects:** Functions that orchestrate operations but need to invoke side effects must receive the necessary handlers (e.g., `FileSystem` instance, HTTP client, logger instance) as arguments.
- **Configuration:** Configuration objects derived from external sources (like environment variables) must be created by pure functions. These functions receive all necessary raw inputs (e.g., an object representing environment variables, system properties) as arguments and should use appropriate validation libraries to parse and transform these inputs into a typed configuration object. This validated configuration object is then created at the application's main entry point and passed down via dependency injection.

## Import Statements

- Do not rename import bindings.
- Never inline `require` and `import` statements, always place them at the top of the file.
- When you are editing files and there are `as Foo` imports, replace them with the actual binding name.
- When using `@foo/bar` imports use the shortest path possible (e.g., `@foo/bar` instead of `@foo/bar/baz`).

## Variable Types

- **camelCase**: Variables, functions, methods, properties
- **PascalCase**: Classes, interfaces, types, enums
- **SCREAMING_SNAKE_CASE**: Constants
- **kebab-case**: File names, CSS classes

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

## Project Analysis and Tooling

- Use TypeScript tool calling to access LSP-based project analysis for the current codebase
- Leverage TypeScript tooling to understand project structure, types, and dependencies before making changes
