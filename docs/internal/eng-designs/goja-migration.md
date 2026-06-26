---
created_on: 2026-06-26 10:20
last_modified: 2026-06-26 10:20
status: current
---

# Engineering Design Doc: Transition to Standard Goja Engine and Unify TypeScript DSL Types

## 1. Objective and non-goals

The objective of this design is to transition the Go-native JavaScript execution engine of the monorepo from Grafana's specialized load-testing fork **Sobek** (`github.com/grafana/sobek`) to the standard upstream **Goja** (`github.com/dop251/goja`) ECMAScript engine. This transition will unlock the official Goja module ecosystem, allowing us to:

- Integrate the official **`github.com/dop251/goja_nodejs/require`** CommonJS module loader into the configuration VM.
- Unify the VM's internal runtime binding types and the compile-time public autocomplete definitions inside a single, shared, 100% DRY TypeScript declaration file `pkg/vm/dsl-types.ts`.
- Eliminate the massive plain-string types templates inside the build pipeline scripts.

### Non-goals

- We must not introduce any end-user runtime dependency on Node.js or Bun; the Go binary must remain entirely standalone and self-contained.
- We must not alter the syntax or properties of `.tool.ts` or `dotfiles.config.ts` configuration files; the public DSL surface must remain 100% backward-compatible.

## 2. Current codebase baseline

Currently, the configuration loading and evaluation pipeline relies on:

- **Sobek VM**: `pkg/vm/loader.go`, `pkg/vm/bindings.go`, and `pkg/vm/vm.go` import and run on `github.com/grafana/sobek`.
- **Compile-time Types Generation**: `packages/build/src/build/steps/generateSchemaTypes.ts` contains a massive, hardcoded plain string `publicDeclarationsTemplate` representing all the rich public DSL signatures. It does not read its contracts dynamically from any shared TypeScript source of truth.
- **VM Loader Types**: `pkg/vm/loader-api.ts` maintains duplicate, slightly different interface declarations of the public DSL types, tailored for Sobek VM's environment bindings.

## 3. Non-negotiable constraints

- **Executable Size**: The compiled Go binary size must remain strictly under the configured budget threshold of 26MB.
- **TypeScript Autocomplete Parity**: The generated `.dist/` type definitions must be 100% complete, rich in JSDocs, and pass all 17 legacy `tsd` type-level verification tests.
- **Type-only Imports**: Any imports inside `pkg/vm/loader-api.ts` pointing to local `.ts` files must be type-only (`import type`) to guarantee that they are fully erased during single-file transpilation and cause no runtime `require` errors inside the VM.

## 4. Exact architecture choice

We will replace the nominal-typed Sobek imports with standard upstream Goja imports across the entire Go codebase. Goja is the official, actively-maintained upstream standard for JS interpretation in Go, and swiping to it instantly allows us to bind `goja_nodejs/require` to enable standard relative path resolving and module caching at runtime.

### Rejected Alternatives

- **Keep Sobek & Custom require()**: Rejected because writing a custom, robust, caching, path-resolving CommonJS module resolution algorithm from scratch would add unnecessary code complexity (~200+ lines of custom Go code) and maintenance overhead, whereas `goja_nodejs` is officially maintained and tested.

## 5. Types and contracts

We will unify all public DSL type signatures, enums, installation parameter registries, and fluent interfaces inside `pkg/vm/dsl-types.ts` with complete JSDoc annotations.

Both `packages/build/src/build/steps/generateSchemaTypes.ts` and `pkg/vm/loader-api.ts` must use this clean file as their single source of truth.

## 6. Exact file plan

### Add

- `pkg/vm/dsl-types.ts`: Holds the unified, rich, JSDoc-documented public interfaces and enums.

### Modify

- `go.mod`, `go.sum`: Swap `github.com/grafana/sobek` with `github.com/dop251/goja`.
- `pkg/vm/loader.go`: Migrate imports to `github.com/dop251/goja` and register Node.js require capability.
- `pkg/vm/bindings.go`: Migrate VM bindings types to standard Goja.
- `pkg/vm/vm.go`: Migrate helper functions to standard Goja.
- `pkg/vm/loader-api.ts`: Import types from `./dsl-types.ts` via `import type`.
- `packages/build/src/build/steps/generateSchemaTypes.ts`: Dynamically read and parse `pkg/vm/dsl-types.ts` to generate `.dist/` declarations.

## 7. Implementation order

1. **Update Go Module**: Replace Sobek with Goja in `go.mod` and run `go mod tidy`.
2. **Refactor `pkg/vm` Go files**: Replace all imports and types pointing to `sobek` with `goja`.
3. **Unify TypeScript Types**: Write `pkg/vm/dsl-types.ts` and update `loader-api.ts` to import from it.
4. **Refactor build pipeline**: Replace the plain-string template in `generateSchemaTypes.ts` with a dynamic file read of `pkg/vm/dsl-types.ts`.
5. **Format & Verify**: Run `bun fix`, `bun typecheck`, and Go tests.

## 8. Testing plan

- **Unit tests**: Execute `go test ./pkg/vm/...` to verify the new VM loader.
- **E2E tests**: Execute `go test ./tests/e2e/...` to verify that all 14 integration test configurations parse, compile, and run on Goja.

## 9. Definition of done

- [x] All occurrences of Sobek are removed from the Go codebase.
- [x] `pkg/vm/dsl-types.ts` exists and acts as the single source of truth.
- [x] `bun typecheck` completes with zero errors.
- [x] `bun check` passes with 100% success.
- [x] A mandatory review pass on this design is performed, resolving all identified feedback.
