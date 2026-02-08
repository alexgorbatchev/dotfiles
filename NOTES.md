# Build Issue Investigation Notes

## Problem Summary

`bun compile` (and `bun release`) failing due to tsd type tests failing with 8 errors.

### Error Pattern

Two types of errors in the tsd tests:

1. `Type false does not satisfy the constraint true` - The `BrewDisallowsUnknown` type check fails
2. `Expected an error, but found none` - The `expectError()` for unknown properties doesn't trigger

### Affected Files

- installer-brew/config.test-d.ts (lines 21:46, 37:0)
- installer-cargo/config.test-d.ts (line 32:0)
- installer-curl-script/config.test-d.ts (line 37:0)
- installer-curl-tar/config.test-d.ts (line 32:0)
- installer-github/config.test-d.ts (line 40:0)
- installer-manual/config.test-d.ts (line 36:0)
- installer-zsh-plugin/config.test-d.ts (line 51:0)

## Root Cause Analysis

### Key Finding 1: z.any() Type Contamination

The `baseInstallParamsSchema` uses `env: z.any().optional()` which contaminates type inference.

When a Zod schema has `z.any()`, the resulting `z.infer<>` type has a property typed as `any`.
In TypeScript, when a type has a property typed as `any`, the `keyof` operator behavior changes.

**Hypothesis to Test**: Does `'unknown' extends keyof { a: string; b: any }` evaluate to `true`?

### Key Finding 2: Type Chain

```typescript
// In baseInstallParamsSchema.ts
interface BaseInstallParams extends Omit<z.infer<typeof baseInstallParamsSchema>, 'env'> {
  env?: BaseEnv; // Properly typed
}

// In brewInstallParamsSchema.ts
type BrewInstallParams = BaseInstallParams & z.infer<typeof brewInstallParamsSchema>;
// brewInstallParamsSchema extends baseInstallParamsSchema, so it ALSO has env: z.any()
```

The issue: Even though `BaseInstallParams` uses `Omit` to remove the `any`-typed env, the
`BrewInstallParams` type re-adds it via `z.infer<typeof brewInstallParamsSchema>`.

### Fix Attempt 1: Omit 'env' from z.infer in all InstallParams types

Changed:

```typescript
type BrewInstallParams = BaseInstallParams & z.infer<typeof brewInstallParamsSchema>;
```

To:

```typescript
type BrewInstallParams = BaseInstallParams & Omit<z.infer<typeof brewInstallParamsSchema>, 'env'>;
```

**Result**: Still failing. Need to verify if this fix actually propagates to the generated schemas.d.ts.

## Current State

### Investigation in Progress

Created debug file in `.tmp/tsd-tests/type-debug.ts` to understand what types tsd is seeing.

## Version Information

- TypeScript: 5.9.3
- tsd: 0.33.0
- zod: 4.3.6
- @typescript/native-preview (tsgo): 7.0.0-dev.20251218.3 (pinned)
- dts-bundle-generator: 9.5.1

## Previous Working State

- v1.0.52 was the last working release
- Same tsd version (0.33.0)
- Same TypeScript version specified (^5.9.3)
- Same zod version locked (4.3.6)

## Fix Attempts Log

### Attempt 1: Omit 'env' from z.infer in all InstallParams types

Changed each installer's params type to use `Omit<z.infer<...>, 'env'>`.
**Result**: FAILED - tsd tests still fail with same errors.

### Attempt 2: Replace z.any() with z.custom<BaseEnv>() in base schema

Changed `baseInstallParamsSchema` from:

```typescript
env: z.any().optional(),
```

To:

```typescript
env: z.custom<BaseEnv>().optional(),
```

Also updated `curlScriptInstallParamsSchema` to use:

```typescript
args: z.custom<CurlScriptArgs>().optional(),
env: z.custom<CurlScriptEnv>().optional(),
```

Also simplified `BaseInstallParams` from interface to simple type alias:

```typescript
export type BaseInstallParams = z.infer<typeof baseInstallParamsSchema>;
```

**Result**: FAILED - tsd tests still fail with 8 errors.

Verified in generated `schemas.d.ts`:

- `env: z.ZodOptional<z.ZodCustom<BaseEnv, BaseEnv>>` ✅ Changed from ZodAny
- Type definitions show `z.infer<typeof brewInstallParamsSchema>` ✅

### Attempt 3: Remove intersection types, use pure z.infer

Changed all installer param types from:

```typescript
type BrewInstallParams = BaseInstallParams & z.infer<typeof brewInstallParamsSchema>;
```

To:

```typescript
type BrewInstallParams = z.infer<typeof brewInstallParamsSchema>;
```

**Rationale**: Since `brewInstallParamsSchema.extend()` already includes base schema fields,
the intersection with `BaseInstallParams` is redundant and might be causing type widening.

**Result**: FAILED - tsd tests still fail with same 8 errors.

## Current Generated Types (After All Attempts)

```typescript
// In schemas.d.ts:
declare const baseInstallParamsSchema: z.ZodObject<{
    auto: z.ZodOptional<z.ZodBoolean>;
    env: z.ZodOptional<z.ZodCustom<BaseEnv, BaseEnv>>;  // ← Now uses ZodCustom, not ZodAny
    hooks: z.ZodOptional<...>;
}, z.core.$strict>;

type BaseInstallParams = z.infer<typeof baseInstallParamsSchema>;

type BrewInstallParams = z.infer<typeof brewInstallParamsSchema>;

interface IInstallParamsRegistry {
    brew: BrewInstallParams;
}
```

## Key Discovery: z.core.$strict Mode

Looking at Zod 4's type definitions:

```typescript
export type $strict = {
  out: {};
  in: {};
};
```

The `$strict` mode on `ZodObject` is supposed to disallow extra properties. But the issue is
how TypeScript resolves `z.infer` when going through multiple layers of type inference.

## Hypothesis: TypeScript Deferred Resolution

The test checks:

```typescript
type BrewParams = IInstallParamsRegistry['brew'];
type UnknownKeyCheck = 'unknown' extends keyof BrewParams ? true : false;
export type BrewDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
```

Even with `z.custom<BaseEnv>()`, if TypeScript can't fully resolve the type at bundle generation time,
`keyof` might return `string | number` (unknown index signature) instead of literal union.

## Diagnostic Test Results (Feb 7, 2026)

Created `debug.test-d.ts` with explicit type checks. Results:

```
debug.test-d.ts:32:0
✖  32:0   Unused @ts-expect-error directive.

✖  37:99  Argument of type string | number | symbol is not assignable to parameter of type 
          "auto" | "formula" | "env" | "hooks" | "cask" | "tap" | "versionArgs" | "versionRegex".
          Type string is not assignable to type "auto" | "formula" | ...
```

### ROOT CAUSE CONFIRMED

`keyof IInstallParamsRegistry['brew']` resolves to `string | number | symbol` instead of
the expected literal union `"auto" | "formula" | "env" | "hooks" | "cask" | "tap" | ...`.

This means:

- `'unknown' extends keyof BrewParams` → `'unknown' extends (string | number | symbol)` → `true`
- Unknown properties are NOT rejected because TypeScript sees an index signature

### Why This Happens

Zod 4's `z.infer` type uses complex conditional/mapped types:

```typescript
export type $InferObjectOutput<T extends $ZodLooseShape, Extra extends Record<string, unknown>> = 
    string extends keyof T ? ... : keyof (T & Extra) extends never ? Record<string, never> : ...
```

When `$ZodLooseShape = Record<string, any>` and the shape type `T` has `string extends keyof T`,
the output becomes a generic record with index signature, not a specific object type.

The type alias `type BrewInstallParams = z.infer<typeof brewInstallParamsSchema>` doesn't get
**fully resolved** in the d.ts file. TypeScript keeps it as a deferred type that, when evaluated
at the consumer site (tsd tests), falls back to index signature behavior.

## Attempt 4: Explicit Interface Definitions - SUCCESS

Instead of relying on `z.infer`, define explicit interfaces that TypeScript can inline:

```typescript
// Instead of:
type BrewInstallParams = z.infer<typeof brewInstallParamsSchema>;

// Use:
interface BrewInstallParams extends BaseInstallParams {
  formula?: string;
  cask?: boolean;
  tap?: string | string[];
  versionArgs?: string[];
  versionRegex?: string;
}
```

This ensures TypeScript has concrete property names to work with.

**Result**: SUCCESS - tsd type tests now pass!

```
🔍 Running tsd type tests...
✅ tsd type tests passed
✅ @dotfiles/core config types validated with tsd
```

### What Was Changed

1. **BaseInstallParams** - Changed from `type = z.infer<>` to explicit interface with `InstallHooks` interface
2. **BrewInstallParams** - Changed to `interface extends BaseInstallParams`
3. **CargoInstallParams** - Changed to `interface extends BaseInstallParams`
4. **CurlTarInstallParams** - Changed to `interface extends BaseInstallParams`
5. **CurlScriptInstallParams** - Changed to `interface extends Omit<BaseInstallParams, 'env'>` (has custom env type)
6. **ManualInstallParams** - Changed to `interface extends BaseInstallParams`
7. **GithubReleaseInstallParams** - Changed to `interface extends BaseInstallParams`
8. **ZshPluginInstallParams** - Changed to `interface extends BaseInstallParams`

### Why Explicit Interfaces Work

1. TypeScript fully resolves interface properties at declaration time
2. `keyof InterfaceName` produces literal union of property names
3. No deferred type resolution that falls back to index signatures
4. dts-bundle-generator can inline the explicit property names

## Remaining Issue: CLI Test Failure (FIXED)

After tsd tests pass, the build fails at CLI test step:

```
🧪 Testing built CLI...
error: Cannot find package 'zod' from '.dist/cli.js'
```

### Root Cause

The build flow had a sequencing issue:

1. `createTempSchemasPackage` writes a workspace root package.json
2. `installDependenciesInOutputDir` installs deps in workspace mode
3. `generateDistPackageJson` overwrites with production package.json

But there was no `bun install` after step 3, so node_modules had stale workspace structure.

### Fix

Added `installDependenciesInOutputDir` call after `generateDistPackageJson` in `build.ts`:

```typescript
await generateDistPackageJson(context, ...);

// Must reinstall after generating production package.json 
// because the prior install used workspace mode
await installDependenciesInOutputDir(context);
```

**Result**: Release 1.0.53 completed successfully!

## Summary

Two issues were fixed:

1. **tsd type test failures**: Changed `z.infer<>` type aliases to explicit interfaces
2. **CLI test failure**: Added reinstall after production package.json generation

## Version Information

- TypeScript: 5.9.3
- tsd: 0.33.0
- zod: 4.3.6
- @typescript/native-preview (tsgo): 7.0.0-dev.20251218.3 (pinned)
- dts-bundle-generator: 9.5.1

## Files Modified

- `packages/core/src/tool-config/base/baseInstallParamsSchema.ts` - Added `InstallHooks` interface, changed `BaseInstallParams` to explicit interface
- `packages/installer-brew/src/schemas/brewInstallParamsSchema.ts` - Changed to explicit interface
- `packages/installer-cargo/src/schemas/cargoToolConfigSchema.ts` - Changed `CargoInstallParams` to explicit interface
- `packages/installer-curl-script/src/schemas/curlScriptInstallParamsSchema.ts` - Changed to explicit interface with `Omit<BaseInstallParams, 'env'>`
- `packages/installer-curl-tar/src/schemas/curlTarInstallParamsSchema.ts` - Changed to explicit interface
- `packages/installer-github/src/schemas/githubReleaseInstallParamsSchema.ts` - Changed to explicit interface
- `packages/installer-manual/src/schemas/manualInstallParamsSchema.ts` - Changed to explicit interface
- `packages/installer-zsh-plugin/src/schemas/zshPluginInstallParamsSchema.ts` - Changed to explicit interface
