# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

### Feasibility Check: Can we delete TS and ship Go today without breaking anything?

**No, absolutely not.**
The codebase is currently in a transitional, asymmetric state and is completely unready for the demolition of the TypeScript (TS) packages (`packages/*`). Attempting to delete the TS implementation today and ship the Go CLI as a standalone product would cause a total collapse of compile-time and runtime environments:

1. **Developer Experience (DX) and Types Collapse**: User-authored configurations (`.tool.ts` and `dotfiles.config.ts`) will lose all autocompletion, type-checking, and fluent API builder context (methods like `.bin()`, `.version()`, `.zsh()`, etc. do not exist on the raw data structures outputted by the Go type generator).
2. **Runtime VM Evaluation & Dynamic Hooks Crash**: Go cannot execute TS configuration files on-the-fly. If Goja/Sobek is forced to run `.tool.ts` configurations dynamically, it fails immediately due to lack of standard transpilation, absence of Node.js/Bun globals/builtins (such as `console.log` or `fs`), and complete stubs for installation lifecycles (like `before-install`, `after-download`, and `after-extract` hooks).
3. **Completely Dead Dashboard Server**: Go's native dashboard server (`pkg/dashboard/`) is merely a static file hosting server with **zero REST API endpoints implemented** (compared to 14 in TS). Any client-side action in the React client will yield standard `404 Not Found` errors.
4. **Shell Configuration and Boot Errors**: Go's shell emission generator generates hardcoded `source` statements inside shell profile initializers for "once-scripts". Once these scripts execute and delete themselves, **every subsequent terminal startup prints noisy "file not found" errors** to standard output/error, breaking shell startup silence. Additionally, Go unconditionally prepends directories to the `$PATH` and `$fpath` variables, causing massive environment pollution on nested shell execution.
5. **Critically Leaking Sandboxing**: Go's orchestrator lacks a sandboxed symbolic link evaluator during `--dry-run` executions, meaning **real symbolic link manipulations are performed on the user's live host system during dry-runs**.

---

### Current Monorepo State

The monorepo operates in a fragile transitional hybrid phase. While Go successfully mimics the declarative output of the TS engine when parsing pre-converted static JSON config files (`dotfiles.config.json`), it remains heavily anchored to Node.js/Bun and the legacy TypeScript packages for config evaluation, dynamic CLI subcommands, validation schemas, the dashboard API, and the release packaging workflow.

---

### Overall Migration Parity Score

**4.5 / 10**

_Technical Justifications:_

- **Core Installers and Shim Generation (7.5 / 10):** Native Go implementation successfully mimics shim generation, directory mapping, and basic package installations, but suffers from deep configuration-merging bugs and lacks validation.
- **Orchestration & Shell Emissions (5 / 10):** Kahn's dependency sorter is present but unstable. Severe error/pollution bugs exist in "once-script" self-deletion tracking and PATH modifications.
- **Dynamic JS/TS Configuration Evaluation (1 / 10):** Bypassed at runtime. The Goja/Sobek VM is present but completely unequipped to handle modern TypeScript syntax, Node.js globals, and interactive callback hooks.
- **Web Dashboard Backend (1 / 10):** Statically hosts UI assets, but has zero implementation for the 14 interactive REST API endpoints.
- **Build & Packaging Pipeline (3 / 10):** Go compilation is automated, but UI asset bundling, type-checking interfaces, and npm package wrappers are completely reliant on TS.

---

### Current Dual-Run Parity Status

The dual-run verification harness (`scripts/parity-harness/main.go`) passes, but this provides a **false sense of security**. The harness operates by feeding the Go binary a pre-converted static JSON file (`dotfiles.config.json`) pre-compiled by TypeScript. It confirms that Go can generate identical final file structures and registry logs _given static JSON inputs_, but it completely masks the dynamic gaps in runtime type-safety, dynamic execution of `.tool.ts` files, interactive JS hooks, and the web dashboard backend.

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### A. The `.tool.ts` Authoring Experience (DX) & Type Completeness

Deleting the legacy TS packages (`packages/core` and `packages/cli`) today will make it impossible for users to author config files with standard IDE assistance.

- **Raw Data Interfaces vs. Fluent Builders**: Go's type-generation pipeline (`scripts/typegen/main.go`) leverages a basic struct-to-interface converter (`typescriptify-golang-structs`). While it successfully generates basic type boundaries (e.g., `interface ToolConfig`), these are raw, static, serialized JSON representations.
- **Missing DSL Context**: The fluent helper builders (such as `defineTool()`, `defineConfig()`, `.bin()`, `.version()`, `.dependsOn()`, `.zsh()`, and `.hook()`) do not exist on the Go-generated types.
- **Loss of Module Augmentation**: In TS, installer-specific parameter autocomplete (e.g., providing type validation when calling `install('brew', { formula: '...' })`) is achieved using package-level TypeScript module augmentation (such as `packages/installer-brew/src/augmentations.ts`). Removing the TS packages permanently wipes out all installer-specific type completions in editors.

### B. JS Execution Engine (Sobek VM vs. Bun/Node)

Go's JS engine (`pkg/vm/`) is powered by Sobek, an ECMAScript 5.1/6 interpreter. It is not currently ready to evaluate real-world user configurations.

1. **Lack of TS Transpiler**: Sobek cannot parse TypeScript syntax. If a user's `.tool.ts` file contains a single type declaration or type assertion, Sobek will throw immediate syntax syntax errors.
2. **No Node.js / Bun Polyfills**: The Go VM does not bind standard Node/Bun objects (like `console`, `fs`, `path`, `fetch`, `Buffer`, or `URL`). Calling `console.log()` or `fetch()` in any user-authored script will crash the VM with `ReferenceError`.
3. **Ignored Configuration Hooks**: Go's bootstrap VM script stubs out dynamic lifecycle hooks:
   ```javascript
   hook(name, cb) {
     return this; // Stubs out callbacks
   }
   ```
   Because Goja/Sobek cannot natively convert JavaScript callback functions into Go executable logic, Go's orchestrator is blind to dynamic scripts. To bypass this in test fixtures, the Go orchestrator has a hardcoded, non-production hack inside `pkg/orchestrator/orchestrator.go`:
   ```go
   if tool.Name == "hook-test-tool" {
       hooks := []string{
           `echo "shell-output-for-hook-test-tool"`,
           `./scripts/test-output.sh`,
       }
       ...
   }
   ```
   Real dynamic configurations utilizing JS-based hooks are completely non-functional.

### C. Dashboard Client & Backend API Gaps

The Preact dashboard client (`packages/dashboard/src/client/`) connects to a REST API. Go's native server (`pkg/dashboard/dashboard.go`) only serves static embedded assets:

```go
subFS, err := fs.Sub(assets, "dist")
if err != nil {
    return fmt.Errorf("failed to locate embedded assets: %w", err)
}
mux := http.NewServeMux()
mux.Handle("/", http.FileServer(http.FS(subFS)))
```

None of the 14 endpoints implemented in the TS server (`packages/dashboard/src/server/dashboard-server.ts`)—such as `/api/tools`, `/api/stats`, `/api/health`, `/api/install`—exist in Go. Launching the dashboard under Go is entirely dead.

### D. Build and NPM Packaging Pipeline

The assembly of the `.dist/` build directory relies on Node-based bundling scripts.

- **UI Asset Compilation**: Bun's bundler compiles Preact assets before copying them to Go. Removing TS packages requires a refactored build chain (such as standalone esbuild or Bun scripts) to bundle React assets, copy them to `pkg/dashboard/dist/` for Go embedding, and compile the final Go binary.
- **Cross-Platform npm Distribution**: Go lacks a packaging step to wrap the compiled binaries inside cross-platform npm packages, bump semantic versions, or publish to registry portals without Node.

---

## 3. Structural & Architectural Gaps

### A. Core File System Abstraction Asymmetry

- **Interface Deficiencies**: TS's `IFileSystem` interface defines a rich, robust array of syscalls (such as symlinking, directory scanning, and permissions). Go's native `FS` interface (`pkg/fs/fs.go`) is heavily stripped down, lacking native support for symlinking, stat/lstat queries, and recursive removals.
- **MemFS Deficiencies**: TS utilizes `memfs` which behaves as a high-fidelity virtual filesystem. Go's `MemFS` is a simple custom map of path strings to file node structures. It does not support symlinks, does not perform correct permission mapping, and lacks recursive delete behaviors (forcing callers to write custom walkers).

### B. Severe Symlink Dry-Run Leak

In `pkg/orchestrator/orchestrator.go`, the Go generator attempts to create symlinks:

```go
symEvaluator := o.getSymlinkEvaluator()
for _, sym := range tool.Symlinks {
    wasCreated, err := symEvaluator.CreateSymlink(sym.Source, sym.Target, symlink.Options{Overwrite: true})
```

However, `getSymlinkEvaluator()` falls back to a real, host-level filesystem evaluator when `o.symlinkFS` is `nil` (which is always the case in CLI production boots):

```go
func (o *Orchestrator) getSymlinkEvaluator() *symlink.Evaluator {
	if o.symlinkFS != nil {
		return symlink.NewEvaluatorWithFS(o.symlinkFS)
	}
	return symlink.NewEvaluator() // uses realFS{} -> issues direct syscalls!
}
```

During a Go `--dry-run` execution, while file operations are correctly sandboxed inside `MemFS`, **symlinks are actively created and removed on the user's real host system**. This violates the local sandboxing boundary and can overwrite real user configuration files in `$HOME`.

### C. Fragile Import Splicer in VM Loader

Goja cannot execute ES modules (`import`/`export`). To run configs, Go uses a fragile regex/string splitter in `pkg/vm/vm.go` to strip imports:

```go
for _, line := range strings.Split(scriptContent, "\n") {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "import ") {
		continue
	}
    ...
```

This fails catastrophically on multi-line ES imports (e.g., importing multiple modules across bracketed newlines), leaving syntax fragments (like `Platform } from "@alexgorbatchev/dotfiles"`) inside the executable buffer, causing Goja to crash on start.

### D. Unstable Topological Sorter Order

Both implementations utilize Kahn's algorithm for topological sorting, but their determinism diverges:

- **TypeScript** implements a deterministic, index-ordered queue wrapper (`insertOrdered`) that preserves original configuration ordering for zero-in-degree nodes that share the same dependency depth.
- **Go** uses a standard slice queue, appending nodes to the back of the queue as their in-degrees drop. This results in unstable, wave-like sorting that differs from TS.

---

## 4. Installer & Package Manager Gaps

### A. Severe Correctness Bug: Platform Override Overwriting

In TS, platform-specific overrides are resolved by recursively deep-merging slices/arrays (like `symlinks`, `copies`, shell `scripts`, and `paths`) and maps (like `env` or `aliases`).
In Go, overrides are resolved inside `cmd/dotfiles/bootstrap.go` using a flat unmarshaling overwrite:

```go
jsonBytes, err := json.Marshal(entry.Config)
if err == nil {
    _ = json.Unmarshal(jsonBytes, tc) // Overwrites preexisting slices entirely!
}
```

Because `json.Unmarshal` onto existing structs overwrites arrays/slices instead of appending to them, **Go silently wipes out all base configuration fields** (like `symlinks` or `binaries`) whenever a platform-specific config is present.

### B. Incomplete Installer Pipeline Features

| Installer Method     | Go File         | TS Package             | Status & Key Architectural Gaps                                                                                                                                                                                                                                      |
| :------------------- | :-------------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cargo`**          | `cargo.go`      | `installer-cargo`      | **Heavy Performance Divergence:** TS fetches pre-compiled binaries via quickinstall or GitHub releases, enabling instant installs. Go executes a heavy from-source local compile via `cargo install`, requiring a local Rust toolchain and causing long build times. |
| **`github-release`** | `github.go`     | `installer-github`     | **Functional Gaps:** Go lacks client caching (triggering GitHub API rate-limiting), regex-based wildcard matching, and the ability to fall back to the authenticated local `gh` CLI.                                                                                 |
| **`manual`**         | `manual.go`     | `installer-manual`     | **Functional Gaps:** Go does not expand configuration placeholders (like `{paths.dotfilesDir}`) in `binaryPath`, failing check validations.                                                                                                                          |
| **`zsh-plugin`**     | `zsh_plugin.go` | `installer-zsh-plugin` | **Functional Gaps:** Missing `getShellInit` method to generate sourcing commands for already-installed plugins on startup.                                                                                                                                           |

### C. Missing Parameter Schemas & Validation

- **TypeScript**: Leverages **Zod** schema validations on all 15 installer parameters, catching type mismatches or incorrect parameters at config load time.
- **Go**: Performs zero structured validation on configuration parameters, unmarshaling them into a raw `map[string]interface{}`. Permissive type-coercion helpers silently swallow type mismatches and return default values, masking configuration bugs.

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### Active Test Files Comparison

| Test Objective               | TS Test Path (`packages/e2e-test/src/__tests__/`) | Go Test Path (`tests/e2e/`) | State / Coverage    |
| :--------------------------- | :------------------------------------------------ | :-------------------------- | :------------------ |
| **Conflicts Detection**      | `conflict.test.ts`                                | `conflict_test.go`          | Functional Parity   |
| **Dependencies Resolution**  | `dependency.test.ts`                              | `dependency_test.go`        | Functional Parity   |
| **Basic Installations**      | `install.test.ts`                                 | `install_test.go`           | Functional Parity   |
| **Stale Symlinks Cleanup**   | `symlink-stale.test.ts`                           | _Missing_                   | **Critical Go Gap** |
| **Auto-Install Lifecycle**   | `auto-install.test.ts`                            | _Missing_                   | **Critical Go Gap** |
| **Enterprise GitHub Config** | `gh-cli-enterprise.test.ts`                       | _Missing_                   | **Critical Go Gap** |
| **Tool Renaming State**      | `tool-rename.test.ts`                             | _Missing_                   | **Critical Go Gap** |

### Risks of Premature TypeScript Demolition:

If TS packages are deleted today, critical features like stale symlink cleaning (preventing orphaned links on disk), auto-install lifecycles, and state tracking for renamed tools will have no coverage, risking silent regressions.

---

## 6. Completed vs. Remaining Backlog

### Completed Merged Wave 5 Milestones

- Cobra CLI command structures in Go.
- Porting of SQLite database models and file logging schemas to Go.
- Core directory-mapping and native installer plugins.
- Raw shell emission formatters.

---

### Remaining Wave 6 Backlog & Roadmap

To safely transition to a pure statically-linked Go binary distribution, the following roadmap must be executed sequentially:

```
[ Phase 1: Build & Pipeline ] ──> [ Phase 2: Complete Go Backend ] ──> [ Phase 3: Solve VM & DX ] ──> [ Phase 4: Port Tests & Demolish ]
```

#### Phase 1: Build & Packaging Pipeline Refactoring

1. **Independent Preact Asset Bundler**: Create an independent build step (using a standalone Bun script or esbuild) to compile and bundle the React/Preact files in `packages/dashboard/src/client/` without referencing the legacy monorepo packages.
2. **Asset Copier**: Move bundled dashboard static files to `pkg/dashboard/dist/` for Go embedding.
3. **Automate Embed Generation**: Ensure `//go:embed` correctly captures files during Go binary compilation.
4. **Cross-Platform npm Packager**: Automate the wrapper construction to bundle cross-platform Go binaries into an npm package.

#### Phase 2: Complete the Go Dashboard API Backend

1. **Implement Go Handlers**: Implement all 14 REST API handlers from the TypeScript dashboard server in Go (using Go's native `http.ServeMux` or a library like `chi`).
2. **Expose DB Statistics**: Wire the handlers to read from Go's registry database (`pkg/db/` and `pkg/registry/`).

#### Phase 3: Solve the `.tool.ts` DX & JSVM Evaluation

1. **Consolidated Types Package**: Extract core types, helpers, and fluent builder DSL into a lightweight, standalone npm type package (e.g., `@alexgorbatchev/dotfiles`) that lives alongside the Go CLI, preserving autocomplete and type-checking.
2. **Typegen Upgrade**: Expand the typegen script to output functional builder helpers and context types alongside raw interfaces.
3. **Bun-Backed Runtime Evaluator**: Avoid fragile VM string manipulation by calling a fast Bun subprocess to transpile and evaluate `.tool.ts` files into a static JSON stream on-the-fly, bypassing Sobek's ES5 and glob limitations.
4. **Interactive Lifecycle Hooks**: Connect Go's orchestrator to run dynamic JS callback hooks at runtime (such as `after-download` and `after-extract`).

#### Phase 4: Port Remaining E2E Tests & Demolish TS

1. Translate all missing E2E integration tests (such as stale symlink cleanup and tool-renaming state tracking) to native Go tests.
2. Verify all checks pass via `bun check:ci`.
3. Perform the demolition: delete the legacy TS packages under `packages/` and distribute the statically-linked Go binary.

---

# DUE DILIGENCE

As per the prime directive ("See something, say something"), the following structural, security, and correctness issues have been identified in the codebase:

1. **Go Once-Script Startup Errors**: The hardcoded `source` and `&` commands generated in Go's `main.<ext>` shell scripts break terminal startup. Once the once-scripts execute and delete themselves, every subsequent shell startup prints noisy "file not found" errors to stderr. This must be replaced with dynamic glob loops.
2. **Unconditional PATH Bloating**: Go lacks conditional presence guards for path additions, causing redundancy and bloating when shell profiles are sourced repeatedly.
3. **In-Memory Buffering Performance Hazard (Potential OOM)**: Inside `pkg/archive/archive.go`, Go's extractor reads file payloads into RAM using `io.ReadAll` before writing them to disk:
   ```go
   entryBytes, err := io.ReadAll(tarReader)
   ```
   If an archive contains a large binary (e.g., a 500MB compiler toolchain), Go will buffer the entire file in RAM, risking Out-Of-Memory crashes on low-resource machines. This should be replaced with chunked streaming via `io.Copy`.
4. **Sudo Interactive Hang Risk**: In non-interactive CI/CD or automated setups, Go's command runner warns but proceeds to spawn `sudo`, causing the execution to hang indefinitely on prompt entries, whereas TS safely throws an error.
5. **Data Race in HTTP Proxy Server**: Inside `Get()`, Go's `CacheStore` acquires a Read Lock (`RLock()`), but attempts to delete files on disk when detecting expired entries. This concurrency violation can cause data corruption or runtime panic crashes under parallel requests.
6. **Hardcoded Testing Hacks in Production**: `pkg/orchestrator/orchestrator.go` contains hardcoded checks specifically for `"hook-test-tool"` to mock lifecycle hooks, violating clean-code standards and separation of concerns.
7. **Complete Loss of Symlinks during Go Extraction**: Go's manual archive extractor completely ignores symbolic link headers (`tar.TypeSymlink`), causing unpacked toolchains (such as Node or Bun) to lose their dependency links and break.
8. **Primitive Asset Selection**: Go's `matchAsset` uses raw lowercase substring checks with a blind fallback to the first asset in the payload, which can result in downloading `.sha256` or text descriptors instead of the correct binary.
9. **Fake Convert Command**: The `convert` command inside `cmd/dotfiles/convert.go` is a non-functional mock that only logs a completion message.
