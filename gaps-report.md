# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

### Feasibility Check: Can we delete TS and ship Go today without breaking anything?

**No, absolutely not.**
The codebase is currently in a transitional, highly asymmetric state and is completely unready for the demolition of the TypeScript (TS) packages (`packages/*`). Attempting to delete the TS implementation today and ship the Go CLI as a standalone product would cause a total collapse of both compile-time and runtime environments:

1. **Complete Developer Experience (DX) and Autocomplete Collapse**: User-authored configurations (`.tool.ts` and `dotfiles.config.ts`) will lose all autocompletion, type-checking, and fluent API builder context. The Go type generator only outputs raw, static data interfaces; it lacks the necessary fluent DSL wrappers (`defineTool`, `defineConfig`, `.bin()`, `.zsh()`, etc.). Furthermore, the types generated inside `.dist/` depend on `zod` types, which will trigger compile errors on user environments because `zod` is omitted from the distribution package dependencies.
2. **Runtime VM Evaluation and Context Crashes**: Go's embedded Sobek JS VM cannot parse or run TypeScript syntax on-the-fly. It relies on a fragile, line-by-line string-replacement regex wrapper in `pkg/vm/vm.go` to strip ES imports, which fails catastrophically on multi-line imports. Crucially, the VM execution loader **completely omits the `ctx` argument** when invoking `defineTool` callbacks. Any `.tool.ts` config attempting to read platform info (`ctx.systemInfo`) or write logs (`ctx.log`) will crash immediately with `TypeError: Cannot read property 'systemInfo' of undefined`.
3. **Broken and Mocked Dashboard Endpoints**: Go's native dashboard server (`pkg/dashboard/dashboard.go`) is currently just a static file server with embedded placeholder assets. Out of the 14 interactive REST API endpoints, critical mutation routes (like `/api/tools/:name/install`, `/api/tools/:name/update`, and `/api/tools/:name/check-update`) are complete stubs that instantly return mock JSON files. Deleting the TS server renders the visual dashboard completely non-functional for executing installations.
4. **Dangerous Dry-Run Sandboxing Leaks**: Go's orchestrator fails to sandbox symbolic links during `--dry-run` executions. Because `o.symlinkFS` is never initialized by the CLI bootstrap sequence, the orchestrator defaults to a standard host-level evaluator, which **performs real, active symbolic link operations directly on the user's home directory during dry-runs**, violating sandboxing guarantees. Additionally, both Go and TS write state logs directly to the physical SQLite database (`registry.db`) during dry-runs, polluting audit records.
5. **No Independent TypeScript Compiler**: Go cannot transpile `.ts` files to `.js` natively. At runtime, the Go bootstrap sequence checks for `.ts` files and silently searches for a pre-converted `.json` file (`dotfiles.config.json`) pre-compiled by a legacy Node/Bun process. The Go-native convert command (`cmd/dotfiles/convert.go`) is a complete stub that does nothing, meaning users *must* retain Node/Bun to run the Go executable.
6. **Shell Initialization Startup Noise and fpath Pollution**: Go once-script execution generates hardcoded `source` statements inside shell profile initializers. Once these scripts execute and delete themselves, **every subsequent terminal opening prints noisy "file not found" errors** to standard output/error, breaking startup silence. Additionally, Go unconditionally prepends directories to the `$PATH` and Zsh `$fpath` variables on every load, leading to massive environment pollution on nested shells.

---

### Current Monorepo State

The monorepo operates in a fragile transitional hybrid phase. While Go successfully compiles and mimics the basic directory layouts and installation executions of the TS engine when given static inputs, it remains heavily anchored to Node.js/Bun for configuration parsing, dynamic VM bindings, autocomplete file generations, and the release packaging workflow.

---

### Overall Migration Parity Score

**4.5 / 10**

*Technical Justifications:*
- **Core Installers and Shim Generation (7.5 / 10):** The Go implementation successfully replicates shim generation, directory mapping, and basic installations, but suffers from severe platform-override merging bugs, lacks structured validation schemas, and compiles Rust crates entirely from source.
- **Orchestration & Shell Emissions (5 / 10):** Sorter Kahn's dependency resolution is present but unstable. Severe performance bottlenecks and pollution bugs exist in "once-script" self-deletion tracking and PATH modifications.
- **Dynamic JS/TS Configuration Evaluation (1 / 10):** High-severity gaps in Sobek VM bindings. Programmatic TS/JS lifecycle hooks are completely ignored, and the lack of a native TS transpiler prevents true Node-free executions.
- **Web Dashboard Backend (2 / 10):** Statically hosts assets, but lacks implementation for half of the REST API endpoints, faking installation and update mutations with static JSON stubs.
- **Build & Packaging Pipeline (3 / 10):** Go compilation is automated, but UI asset bundling, type-checking validation, and npm packaging remain completely dependent on Bun/Node.

---

### Current Dual-Run Parity Status

The dual-run verification harness (`scripts/parity-harness/main.go`) is currently **non-existent on disk**, as its files were deleted or moved, yet its existence is still conceptually referenced across closed Wave 5 tickets. The automated E2E test harness (`tests/e2e/harness.go:62-64`) passes, but this provides a **false sense of security**. The harness operates by feeding the Go binary a pre-converted static JSON file (`dotfiles.config.json`) pre-compiled by TypeScript. It confirms that Go can generate identical final file structures and registry logs *given static JSON inputs*, but it completely masks the dynamic gaps in runtime type-safety, dynamic execution of `.tool.ts` files, interactive JS hooks, and the web dashboard backend.

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### A. The `.tool.ts` Authoring Experience (DX) & Type Completeness

Deleting the legacy TS packages (`packages/core` and `packages/cli`) today will make it impossible for users to author config files with standard IDE assistance.

- **Raw Data Interfaces vs. Fluent Builders**: Go's type-generation pipeline (`scripts/typegen/main.go`) leverages a basic struct-to-interface converter (`typescriptify-golang-structs`). While it successfully generates basic type boundaries (e.g., `interface ToolConfig` in `types.gen.ts`), these are raw, static, serialized JSON representations.
- **Missing DSL Context**: The fluent helper builders (such as `defineTool()`, `defineConfig()`, `.bin()`, `.version()`, `.dependsOn()`, `.zsh()`, and `.hook()`) do not exist on the Go-generated types.
- **Zod Dependency Leak**: The generated `schemas.d.ts` file prepends `import { ZodError, z } from 'zod';` into its declarations, but the build pipeline's generated `.dist/package.json` omits `zod` from package dependencies. This triggers immediate TypeScript compiler errors for users who check their configurations in environments without `zod` pre-installed.
- **Loss of Module Augmentation**: In TS, installer-specific parameter autocomplete (e.g., providing type validation when calling `install('brew', { formula: '...' })`) is achieved using package-level TypeScript module augmentation (such as `packages/installer-brew/src/augmentations.ts`). Removing the TS packages permanently wipes out all installer-specific type completions in editors.

### B. JS Execution Engine (Sobek VM vs. Bun/Node)

Go's JS engine (`pkg/vm/`) is powered by Sobek, an ECMAScript 5.1/6 interpreter. It is not currently ready to evaluate real-world user configurations.

- **Lack of TS Transpiler**: Sobek cannot parse TypeScript syntax. If a user's `.tool.ts` file contains a single type declaration or type assertion, Sobek will throw immediate syntax syntax errors.
- **The Undefined `ctx` Runtime Crash**: In the public TS types (`generateSchemaTypes.ts`), `defineTool` is typed to receive a callback:
  ```typescript
  export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => any;
  ```
  However, the Go-native bootstrap script inside Sobek VM is implemented as:
  ```javascript
  if (typeof callback === 'function') {
    const res = callback(install); // ONLY passes install!
  }
  ```
  The second argument `ctx` is completely ignored and left `undefined`. If any user-authored `.tool.ts` tries to evaluate platform details via `ctx.systemInfo` or log via `ctx.log` at runtime inside Sobek, the execution will crash with a `TypeError: Cannot read property 'systemInfo' of undefined`.
- **Naive Import Parser**: Go strips imports using `strings.HasPrefix(trimmed, "import ")`. Multi-line ES imports fail to strip and cause syntax/parsing crashes.
- **No Node.js / Bun Polyfills**: The Go VM does not bind standard Node/Bun objects (like `console`, `fs`, `path`, `fetch`, `Buffer`, or `URL`). Calling `console.log()` or `fetch()` in any user-authored script will crash the VM with `ReferenceError`.
- **Ignored Configuration Hooks**: Go's bootstrap VM script stubs out dynamic lifecycle hooks:
  ```javascript
  hook(name, cb) {
    return this; // Stubs out callbacks
  }
  ```
  Because Go's VM cannot natively convert JavaScript callback functions into Go executable logic, Go's orchestrator is blind to dynamic scripts. To bypass this in test fixtures, the Go orchestrator has a hardcoded, non-production hack inside `pkg/orchestrator/orchestrator.go`:
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

The React/Preact dashboard client (`packages/dashboard/src/client/`) connects to a REST API. Go's native server (`pkg/dashboard/dashboard.go`) only serves static embedded assets and lacks functional endpoints for key mutations:

- **Serving Placeholders**: The currently checked-in `pkg/dashboard/dist/index.html` is just a 10-line HTML placeholder. The actual production-ready bundle assets must be compiled and output to this directory during the build phase (`packages/build/src/build/steps/buildDashboard.ts`) before compiling the Go binary.
- **API Endpoints Status**:
  - `/api/tools/:name/readme`: **STUB** (Always returns `# {name} README\nReadme loaded natively in Go`)
  - `/api/tools/:name/install`: **STUB** (Always returns `{"installed": true}` immediately)
  - `/api/tools/:name/check-update`: **STUB** (Always returns `{"hasUpdate": false}` immediately)
  - `/api/tools/:name/update`: **STUB** (Always returns `{"updated": false}` immediately)

Any action taken via the visual dashboard UI to trigger installations, updates, or check for updates is a complete fake, returning hardcoded mock payloads.

### D. Build and NPM Packaging Pipeline

The assembly of the `.dist/` build directory relies on Node-based bundling scripts.

- **UI Asset Compilation**: Bun's bundler compiles Preact assets before copying them to Go. Removing TS packages requires a refactored build chain (such as standalone esbuild or Bun scripts) to bundle React assets, copy them to `pkg/dashboard/dist/` for Go embedding, and compile the final Go binary.
- **Cross-Platform npm Distribution**: Go lacks a packaging step to wrap the compiled binaries inside cross-platform npm packages, bump semantic versions, or publish to registry portals without Node.

---

## 3. Structural & Architectural Gaps

### A. Core File System Abstraction Asymmetry

- **Interface Deficiencies (CopyFile Missing)**: Go's `FS` interface (`pkg/fs/fs.go`) is heavily stripped down, lacking native support for file copying, symlinking, and stat/lstat queries. Because of this, file-copying operations in the Go codebase completely bypass the `fs.FS` abstraction:
  - In `pkg/installer/dmg.go` (lines 258-260), copying is done by spawning standard shell commands (`cp -R`):
    ```go
    copyCmd := d.runner.CommandContext(ctx, "cp", "-R", appSource, appDest)
    ```
  - In `pkg/archive/archive.go`'s `copyDir` helper (lines 509-525), the copy logic walks physical directories on the host operating system using `filepath.Walk` and opens source files via standard OS-level calls (`os.Open`), **completely bypassing the custom `fs.FS` virtual boundaries**:
    ```go
    srcFile, err := os.Open(path) // Hard bypasses fsys abstraction!
    ```
- **MemFS Deficiencies**: TS utilizes `memfs` which behaves as a high-fidelity virtual filesystem. Go's `MemFS` is a simple custom map of path strings to file node structures. It does not support symlinks, does not perform correct permission mapping, and lacks recursive delete behaviors (forcing callers to write custom walkers).

### B. Severe Symlink Dry-Run Leak

In `pkg/orchestrator/orchestrator.go`, the Go generator attempts to create symlinks:

```go
symEvaluator := o.getSymlinkEvaluator()
for _, sym := range tool.Symlinks {
    wasCreated, err := symEvaluator.CreateSymlink(sym.Source, sym.Target, symlink.Options{Overwrite: true})
```

However, `getSymlinkEvaluator()` falls back to a real, host-level filesystem evaluator when `o.symlinkFS` is `nil` (which is always the case in CLI production boots because it is never initialized by the CLI bootstrap sequence):

```go
func (o *Orchestrator) getSymlinkEvaluator() *symlink.Evaluator {
	if o.symlinkFS != nil {
		return symlink.NewEvaluatorWithFS(o.symlinkFS)
	}
	return symlink.NewEvaluator() // uses realFS{} -> issues direct syscalls!
}
```

During a Go `--dry-run` execution, while file operations are correctly sandboxed inside `MemFS`, **symlinks are actively created and removed on the user's real host system**. This violates the local sandboxing boundary and can overwrite real user configuration files in `$HOME`.

### C. Unstable Topological Sorter Order

Both implementations utilize Kahn's algorithm for topological sorting, but their determinism diverges:

- **TypeScript** implements a deterministic, index-ordered queue wrapper (`insertOrdered`) that preserves original configuration ordering for zero-in-degree nodes that share the same dependency depth.
- **Go** uses a standard slice queue, appending nodes to the back of the queue as their in-degrees drop. This results in unstable, wave-like sorting that differs from TS and depends purely on internal map traversal orders.

### D. Over-Aggressive Ambiguous Dependency Failures

- **Go Sorter**: builds a flat `binaryProviders := make(map[string]string)`. If *any* two tools declare the same binary name (e.g., both Tool A and Tool B define a binary named `helper` in their `.bin()` outputs), Go immediately crashes the entire execution with an ambiguous dependency error, even if no other tool in the entire project depends on `helper`.
- **TypeScript Sorter**: tracks providers inside a Set (`Set<string>`) in its `binaryProviders` map. TS allows overlapping binary definitions in configurations and only throws an ambiguous dependency validation error if some Tool C *actually* lists `helper` in its `dependencies` array.

---

## 4. Installer & Package Manager Gaps

### A. Severe Correctness Bug: Platform Override Overwriting

In TS, platform-specific overrides are resolved by recursively deep-merging slices/arrays (like `symlinks`, `copies`, shell `scripts`, and `paths`) and maps (like `env` or `aliases`).
In Go, overrides are resolved inside `cmd/dotfiles/bootstrap.go` using a flat unmarshaling overwrite:

```go
// cmd/dotfiles/bootstrap.go
jsonBytes, err := json.Marshal(entry.Config)
if err == nil {
    _ = json.Unmarshal(jsonBytes, tc) // Overwrites preexisting slices entirely!
}
```

Because `json.Unmarshal` onto existing structs overwrites arrays/slices instead of appending or deep-merging them, **Go silently wipes out all base configuration fields** (like `symlinks`, `binaries`, and `dependencies`) whenever a platform-specific config is present. For example, if a tool config defines global base `symlinks`, but then defines a platform-specific setting under `platformConfigs` (such as setting an `env` variable for macOS), Go's unmarshaler will **silently delete all of the tool's base symlinks and binaries**, since the platform-specific override does not repeat them.

### B. Incomplete Installer Pipeline Features

| Installer Method | Go File | TS Package | Status & Key Architectural Gaps |
| :--- | :--- | :--- | :--- |
| **`cargo`** | `cargo.go` | `installer-cargo` | **Heavy Performance Divergence:** TS fetches pre-compiled binaries via quickinstall or GitHub releases, enabling instant installs. Go executes a heavy from-source local compile via `cargo install`, requiring a local Rust toolchain and causing long build times. |
| **`github-release`** | `github.go` | `installer-github` | **Functional Gaps:** Go's `matchAsset` function simply checks for standard substring matches for OS/Arch and, if none match, **returns the first asset in the release (`assets[0]`)**. This is highly dangerous and can download deb/rpm packages or invalid architectures on unsupported machines. It also lacks client caching (triggering rate-limiting) and the ability to fall back to the authenticated local `gh` CLI. |
| **`curl-script`** | `curl_script.go` | `installer-curl-script` | **Critical parameter gaps**: Ignores `args` (script params), `env` (environment variables passed to script execution), `versionArgs` (arguments to detect version from CLI), and `versionRegex` (regex parser). Does not copy binaries from global paths like `/usr/local/bin` (TS does). |
| **`curl-binary`** | `curl_binary.go` | `installer-curl-binary` | **Parameter gaps**: Ignores `versionArgs` and `versionRegex`. Cannot auto-detect CLI versions. |
| **`curl-tar`** | `curl_tar.go` | `installer-curl-tar` | **Parameter gaps**: Ignores `versionArgs` and `versionRegex`. Cannot extract and automatically find/rename the correct binary if it doesn't match the tool name. |
| **`zsh-plugin`** | `zsh_plugin.go` | `installer-zsh-plugin` | **Functional Gaps:** Missing `getShellInit` method to generate sourcing commands for already-installed plugins on startup. |
| **`apt`, `dnf`, `pacman`** | `pkg/installer/*.go` | `installer-*` | `CheckUpdate` is a complete stub (`return &UpdateCheckResult{HasUpdate: false}, nil`) across all system package managers in Go. |

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### Active Test Files Comparison

| Test Objective | TS Test Path (`packages/e2e-test/src/__tests__/`) | Go Test Path (`tests/e2e/`) | State / Coverage |
| :--- | :--- | :--- | :--- |
| **Conflicts Detection** | `conflict.test.ts` | `conflict_test.go` | Functional Parity |
| **Dependencies Resolution** | `dependency.test.ts` | `dependency_test.go` | Functional Parity |
| **Basic Installations** | `install.test.ts` | `install_test.go` | Functional Parity |
| **Stale Symlinks Cleanup** | `symlink-stale.test.ts` | _Missing_ | **Critical Go Gap** |
| **Auto-Install Lifecycle** | `auto-install.test.ts` | _Missing_ | **Critical Go Gap** |
| **Enterprise GitHub Config** | `gh-cli-enterprise.test.ts` | _Missing_ | **Critical Go Gap** |
| **Tool Renaming State** | `tool-rename.test.ts` | _Missing_ | **Critical Go Gap** |

### Risks of Premature TypeScript Demolition:

If TS packages are deleted today, critical features like stale symlink cleaning (preventing orphaned links on disk), auto-install lifecycles, and state tracking for renamed tools will have no coverage, risking silent regressions. There are **14 core TypeScript E2E test files** that have not been migrated to Go.

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
[ Phase 1: Sandboxing & Merges ] ──> [ Phase 2: Modernize Downloader ] ──> [ Phase 3: Dashboard & Logs ] ──> [ Phase 4: Port Tests & Demolish ]
```

#### Phase 1: Core Sandboxing and Correctness Bugs Resolution

1. **Ticket: `2026-06-25-wave-6-resolve-dry-run-symlink-leaks-and-enforce-in-memory-sandboxing.md`**
   - Redirect all SQLite connections to `:memory:` when `--dry-run` is requested.
   - Force initialization of `symlinkFS` inside the CLI bootstrap sequence to prevent host-level symlink creation during dry-runs and unit tests.
2. **Ticket: `2026-06-25-wave-6-fix-platform-config-deep-merge-and-overwrite-bugs.md`**
   - Refactor `ResolvePlatformConfigs` in `cmd/dotfiles/bootstrap.go` to perform recursive, deep-field merging on `ToolConfig` structures instead of flat JSON unmarshaling. Append arrays/slices and merge maps.
3. **Ticket: `2026-06-25-wave-6-resolve-pointer-unmarshaling-in-sobek-jsvm-configuration-exports.md`**
   - Write a dedicated unit test suite in `pkg/vm/pointer_unmarshal_test.go` to validate pointer-field unmarshaling against `config.ToolConfig` structures, verifying omitted, `null`, and `undefined` JS property unmarshaling.

#### Phase 2: Downloader, Archive Extractor, and Shell Init Modernization

1. **Ticket: `2026-06-25-wave-6-modernize-downloader-and-archive-extractor-capabilities.md`**
   - Implement stream-based tar/zip symlink extractor capabilities.
   - Support authorization headers inside `pkg/downloader/downloader.go` to pass GitHub token authorizations and download from private repositories.
   - Fix Zip Extractor OOM issues by streaming chunked bytes using `io.Copy` instead of calling `io.ReadAll`.
   - Restore file timestamps (`os.Chtimes`) during extraction.
2. **Ticket: `2026-06-25-wave-6-fix-shell-initialization-once-script-errors-and-path-pollution.md`**
   - Refactor once-script cleanup from a hardcoded loop to a native `ReadDir` directory scan to avoid 4,000 file-system existence checks.
   - Replace hardcoded `source` statements inside shell profile initializers with dynamic glob loops that skip deleted scripts.
   - Add conditional presence guards in `main.<shell>` to prevent redundant `$PATH` and `$fpath` env duplication.
3. **Ticket: `2026-06-25-wave-6-resolve-proxy-cache-concurrency-races-and-glob-clearing-boundaries.md`**
   - Implement read-write locking safety inside the HTTP Cache Proxy server (`pkg/proxy/`).
   - Fix file-handle and connection leaks during test cycles.

#### Phase 3: Web Dashboard Server & Build Pipeline

1. **Ticket: `2026-06-25-wave-6-standardize-go-structured-logging-and-remove-orchestrator-test-hacks.md`**
   - Integrate structured logging `pkg/logger` across all Go installer plugins and Sobek VM runners.
   - Remove hardcoded `"hook-test-tool"` conditions from production files.
2. **Ticket: `2026-06-25-wave-6-modernize-binary-size-limit-and-verification.md`**
   - Raise the bundle size check boundaries inside the CI/CD pipeline to accommodate the compiled Go binary size of 15MB to 25MB.
3. **Ticket: `2026-06-25-wave-6-implement-cross-platform-npm-binary-wrapper.md`**
   - Build a lightweight, cross-platform npm package wrapper for `dotfiles` that maps optional platform dependencies to native pre-compiled Go executables.
4. **Ticket: `2026-06-25-wave-6-pure-go-binary-distribution-and-ts-demolition.md`**
   - Complete the 14 REST API handlers inside the Go-native dashboard server (`pkg/dashboard/dashboard.go`).
   - Copy minified Preact dashboard client bundles directly into `pkg/dashboard/dist/` for static `//go:embed` asset serving.
   - Transition type-generation schemas to output complete fluent API builder dts-files.

#### Phase 4: Test Suite Porting and Demolition

1. **Ticket: `2026-06-25-wave-6-complete-remaining-e2e-integration-test-suite-migration.md`**
   - Translate all 14 remaining E2E TypeScript integration tests to native Go E2E tests, verifying stale symlink cleaning and tool-renaming states.
2. **Execute Demolition**: Safely remove all legacy TypeScript packages under `packages/*` (retaining only `dashboard` and `build`), update root `package.json` workspaces, and rely entirely on the statically-linked Go binary.

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
10. **Bypassed File-System Sandboxing on Direct Copies**: Both the macOS `dmg` installer (`pkg/installer/dmg.go`) and the directory copy helper (`pkg/archive/archive.go`) execute hardcoded shell calls (`cp -R`) or direct system `os.Open` calls, bypassing the custom virtual `fs.FS` interface.
11. **Pragma Performance Gap**: Go's SQLite connection pool lacks the `PRAGMA synchronous = NORMAL` initialization. This results in significantly slower, blocking disk sync operations on low-resource host environments compared to the legacy TS engine.
