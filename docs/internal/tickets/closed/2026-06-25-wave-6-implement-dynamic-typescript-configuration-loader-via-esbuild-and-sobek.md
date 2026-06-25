---
created_on: 2026-06-25 15:00
last_modified: 2026-06-25 15:00
status: completed
ticket_status: closed
---

# Wave 6: Implement Dynamic TypeScript Configuration Loader via Esbuild and Sobek

## Problem

Historically, the Go-native application did not have a real-time, on-the-fly compiler/loader for TypeScript configurations (`config.ts` and `*.tool.ts` files). Instead, it relied on pre-converted static `config.json` files checked into the repository. These JSON files contained hardcoded absolute directory paths that mismatched from sandbox paths during E2E integration test runs, resulting in sandbox directory leaks.

## Solution

We have designed, implemented, and fully integrated a dynamic TypeScript-to-JavaScript compiler and loader in Go utilizing `github.com/evanw/esbuild/pkg/api` as a library and the embedded `github.com/grafana/sobek` JS runtime.

1. **Embedded Config-Loader API (`loader-api.ts`)**: Built a robust, minimal TypeScript implementation of `defineConfig`, `defineTool`, `Platform`, and `Architecture` (defined in `pkg/vm/loader.go`), serving as a drop-in swap for the legacy TS packages.
2. **Esbuild Compilation**: Automatically compile and bundle the `config.ts` file and all recursively-discovered `*.tool.ts` files using `esbuild` Go library, intercepting imports matching `@dotfiles/*` or `@alexgorbatchev/dotfiles` and resolving them to the in-memory loader API.
3. **VM Execution & Serialization**: Execute the bundled JS inside Sobek, using `JSON.stringify` inside the JS VM to safely strip out any callback functions/hooks before marshaling results directly to Go structs.
4. **Context Injection & Sandbox bindings**: Integrated `IToolConfigContext` matching `ctx` passing systemInfo, bridges to Go's structured logger wrapper, and sandboxed read-only filesystem check bindings (`exists`, `readDir`, `readFile`) that query the active virtual filesystem volume.
5. **JSON Demolition**: Deleted all static, hardcoded, pre-compiled `config.json` files and legacy `.generated` directories from git/E2E fixtures.

## Verification

- Running `go test -v ./pkg/vm/...` executes our precise unmarshalling and VM context bindings/logging tests with 100% success.
- Running `go test -v ./tests/e2e/...` executes the entire E2E integration test suite, achieving 100% green pass in full, clean sandboxes.
