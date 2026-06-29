# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

- **feasibility check: Can we delete TS and ship Go today without breaking anything?**
  **NO, absolutely not.** Demolishing the remaining TypeScript packages and distributing the compiled Go binary to users today will cause multiple severe, immediate, and silent breakages in the runtime environment, the visual user experience, and the developer workflow:
  1. **Visual UI Dashboard Collapse**: The Preact-based visual dashboard will immediately crash with uncaught JavaScript errors (e.g., `TypeError: Cannot read properties of undefined (reading 'status')`) on startup because Go's `/api/tools` endpoint returns a flat list (`toolState` summary shape) instead of the fully realized `IToolDetail` nested structure that the frontend client expects.
  2. **Autocomplete and Editor DX Collapse**: Removing legacy TS packages without publishing a dedicated ambient types package (`@alexgorbatchev/dotfiles`) will cause autocomplete, type boundaries, and editor validations for user-authored `.tool.ts` and `dotfiles.config.ts` files to break entirely.
  3. **Critical Dynamic Hook Failures**: Go's loader executes JavaScript hook closures immediately during the _parsing_ stage, capturing shell-evaluated strings to execute via `bash -c` during installation. Any `.tool.ts` file employing dynamic logic (conditional checks, loop operations, or virtual filesystem calls like `ctx.fs.writeFile`) will silently fail or crash the parser.
  4. **Critical Symlink Directory Traversal (Zip-Slip Security Vulnerability)**: Go's archive extraction mechanism (`pkg/archive/archive.go`) does not sanitize or restrict symbolic link targets inside extracted tar/zip archives. A malicious archive can create a symlink escaping the target directory and write arbitrary files anywhere on the user's host system.
  5. **Broken Sourced Files (Process Substitution Bug)**: Sourced scripts (`SourceFiles` list) are wrapped in subshell process-substitution functions (`source <(cat "/path")`). This causes any location-aware script relying on `${BASH_SOURCE[0]}` or `${(%):-%x}` to instantly crash.
  6. **Host Directory Symlink Leaks during Tests**: Due to a preflight bypass in `bootstrap.go`, running unit tests with `dryRun = false` fails to initialize the virtual filesystem symlink evaluator. This causes test symlinks to bypass the `MemFS` memory sandbox and write physical symlinks directly to the developer's real host machine.
  7. **Complete Loss of Downloader Log & Stdout Parity**: Go's `TrackedFileSystem` does not output any user-facing console logs (such as `write`, `rm`, `ln -s`) during file mutations, making executions entirely silent and breaking downstream log-parsing engines.
  8. **Missing Release Packaging Pipeline**: We still lack a Go-native pipeline to transpile Preact client assets, embed them in Go, generate fluent DSL type declarations, and compile/structure the final `.dist/` for npm distribution.

- **Current Monorepo State**
  The repository is in a transitional, hybrid state. While the majority of legacy TypeScript packages have been demolished on the `agorbatchev/golang` branch, two essential packages remain: `packages/dashboard` (for React/Preact client UI assets) and `packages/build` (for orchestrating schema type generation, frontend compilation, and distribution packaging). The Go binary compiles cleanly and implements a native `esbuild` and `sobek` execution engine to run JS/TS configurations, but is currently constrained by multiple architectural and contract-level gaps.

- **Overall Migration Parity Score**
  **6.5 / 10**

  _Technical Justifications:_
  - **Dynamic JS/TS Compilation and VM Execution (7.0 / 10):** The native `esbuild` and standard `sobek` VM integration is highly robust, but dynamic installer hook callbacks are degraded to static parsing-time strings, rendering conditional JavaScript statements inside hooks non-functional.
  - **Core Installers & Package Managers (6.0 / 10):** All 15 installers exist in Go, but global binary tracking is missing (resulting in zero shim generation for package-managed tools), `shellInit` hooks are absent (preventing shell plugins from being loaded), and staging folders are polluted with non-promoted files.
  - **File System & DB Sandboxing (5.5 / 10):** Go uses transactional db writes and memory-redirected systems (`MemFS`), but suffers from tilde (`~`) path expansion collapse, non-deterministic `ReadDir` ordering, a recursive folder-deletion state tracking bug, and severe symlink leaks during testing.
  - **Web Dashboard Backend (5.0 / 10):** Statically hosts bundled assets, but returns flattened API summaries that crash the UI, and relies on hardcoded health check stubs.
  - **Release and Build Pipeline (5.0 / 10):** Completely reliant on the legacy Node/TypeScript `packages/build` runner.

- **Current Dual-Run Parity Status**
  `bun check:ci` and the dual-run verification harness (`scripts/parity-harness/main.go`) report green, but they are over-simplifying state validations. They fail to test visual console regressions (loss of progress bars and file-mutation logs), and they mask silent tracking failures (such as empty database entries on un-transacted `TrackedFileSystem` operations and persistent db records on recursively deleted folder contents).

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### A. The `.tool.ts` Authoring Experience (DX) & Type Boundary Completeness

- **Ambient Types Package Requirement**: Users writing local configuration scripts require autocompletion and IDE compiler validation. Today, `packages/core` provides these typings. If we demolish the TS packages, the types must be compiled and distributed via an npm package named `@alexgorbatchev/dotfiles`.
- **Typings Gaps**: The Go type-generator (`scripts/typegen/main.go`) only outputs raw JSON-serializable TS interfaces (`types.gen.ts`). It completely omits the fluent builder DSL (such as `defineTool`, `.bin()`, `.version()`, `.dependsOn()`, `.zsh()`). While `pkg/vm/dsl-types.ts` and `loader-api.ts` define these in the Go workspace, they are not packaged or linked into a stable user-facing type boundary.
- **Async vs Sync Filesystem Mismatch**: The public `IFileSystem` interface declares asynchronous, promise-returning methods (e.g., `readFile(path: string): Promise<string>`). However, Goja's native binding pool registers `fsExists`, `fsReadDir`, and `fsReadFile` as purely synchronous functions.
- **Missing FS Mutation APIs**: Crucial file mutation methods specified in the public TS typings—specifically `writeFile`, `mkdir`, and `rm`—are completely missing from the Goja-bound VM runtime environment. Any user tool attempting to write, make directories, or remove files via the virtual filesystem context will fail at runtime with a `TypeError: undefined is not a function`.
- **Platform & Architecture Enums**: The type definitions dictate that users compare environment metadata using enums (`ctx.systemInfo.platform === Platform.MacOS`). In contrast, Goja's VM runtime context only injects primitive string representations (`"darwin"`, `"linux"`, `"amd64"`), making such platform checks evaluate to `false` silently.
- **Duplicate Type Declarations**: During build, `scripts/build/main.go` concatenates type interfaces from `dsl-types.ts` and extracted declarations, generating duplicate identifiers for `PlatformCallback`, `ArchCallback`, and `ShellCallback` inside `.dist/` declarations, breaking strict TS compilation.
- **Stale Dependencies**: The dashboard client package (`packages/dashboard/package.json`) contains stale references to deleted TypeScript monorepo workspace modules, breaking clean `bun install` executions in fresh environments.

### B. Dynamic Hook Callback Degradation (JS/TS Execution Engine)

- **TypeScript Runtime Execution**: In TS, hooks are dynamic, live async JavaScript callbacks executed _during_ installation stages. They receive a live context including a virtual file system to check, write, or modify extracted contents:
  ```typescript
  .hook('after-extract', async (ctx) => {
      if (await ctx.fs.exists(`${ctx.stagingDir}/config.json`)) {
          await ctx.fs.writeFile(`${ctx.stagingDir}/override.json`, "...");
      }
  })
  ```
- **Go Parser Capture**: Goja (`pkg/vm/`) cannot run dynamic JS callbacks on-the-fly during installation because the JS engine is isolated within the configuration loader layer. Instead, it evaluates hooks **at parse time**, mocking the shell command helper (`$`) to capture run statements as static strings.
- **Behavioral Gaps**:
  1. Any conditional evaluation, looping, or dynamic context reading inside the JS hook block is entirely lost.
  2. Any virtual file system operations (like `ctx.fs.writeFile`) inside the hook will instantly crash the parser because the stubbed `fs` inside `loader-api.ts` lacks write implementation.
  3. Go's orchestrator only supports the `after-install` hook, entirely ignoring the `before-install`, `after-download`, and `after-extract` hooks.

### C. Dashboard Client & Backend API Gaps (Preact UI Crash)

- **The `/api/tools` Object Shape Mismatch**: The Preact UI `Tools.tsx` page fetches `/api/tools` expecting an array of `IToolDetail` objects. It processes them as follows:
  ```typescript
  const installedCount = toolsList.filter((tool) => tool.runtime.status === "installed").length;
  ```
  The Go backend (`routes.go` - `handleGetTools`) returns a flat list of `toolState` structs (which maps to `IToolSummary` instead of `IToolDetail`), placing the `Status` field directly at the root. Because `tool.runtime` is undefined, the frontend instantly throws an uncaught exception:
  `TypeError: Cannot read properties of undefined (reading 'status')`
  and renders a blank screen.
- **Tool Detail Page Collapse**: The tool detail visualizer (`ToolDetail.tsx`) queries the global `/api/tools` endpoint and client-side filters for detailed properties (like `files` list and `usage` logs). Under the Go server, these fields are missing, throwing further uncaught properties errors.
- **Dead SSE Code**: A heavy Server-Sent Events (SSE) log broadcasting system exists in the Go server but remains entirely unused by the Preact client interface.

### D. Build and NPM Packaging Pipeline

- **TypeScript Dependency**: The assembly of `.dist/` is orchestrated entirely by `packages/build/src/build/build.ts` using Bun.
- **Demolition Redesign**: If we demolish TS, we must rewrite this build pipeline as a native Go script or Makefile. The pipeline must:
  1. Trigger `bun build` to compile the Preact dashboard into `pkg/dashboard/dist` before building Go (as Go embeds these assets at compile time).
  2. Concatenate `pkg/vm/dsl-types.ts` and `pkg/vm/loader-api.ts` into a unified `schemas.d.ts` declaration for type distribution.
  3. Run cross-platform compilations for all target architectures and bundle them into native npm optional-dependency packages.
  4. Implement Go-native compiled binary size constraint validation (failing builds exceeding 26000 KB).
  5. Spawn TSD (`tsd` CLI) to run type-level test suites on generated declarations to verify type-check health.

---

## 3. Structural & Architectural Gaps

### A. File System Abstractions & State Gaps

- **Tilde Home Path Expansion Collapse**: TS employs a `ResolvedFileSystem` wrapper to dynamically intercept and expand home shortcuts (`~` and `~/`) on all path arguments. In Go, `ExpandHomePath` exists as a utility but is **never invoked anywhere in the file system or installer pipeline**. Paths targeting `~` write literal folders named `~` in the current directory or fail on disk.
- **Recursive Directory Deletion Tracking Bug**: When recursively deleting folders via `fsys.RemoveAll`, Go's `TrackedFileSystem` only logs a single record for the parent folder. TS scanned the directory and wrote distinct `rm` records for all nested contents. This leaves all deleted nested files recorded as "active" in Go's SQLite registry, resulting in persistent database state drift.
- **Content Change Skip Optimization Gap**: TS's `TrackedFileSystem.writeFile` skips physical writes and database logging if the content has not changed. Go's `WriteFile` always overwrites and logs operations, resulting in redundant disk writes and duplicate SQLite tracking records.
- **MemFS Ordering Non-Determinism**: Go's `MemFS.ReadDir` iterates a standard Go map, returning directory elements in a non-deterministic random order. TS returns alphabetically sorted directory listings.
- **MemFS Broken Symlink Semantics**: Checking existence (`Exists`) on a broken symlink inside Go's `MemFS` returns `true` because it executes a raw map lookup on the symlink node itself rather than following the symlink target path. Real filesystems and TS's `MemFileSystem` return `false`.
- **MemFS ReadDir Error Hiding**: Go's `MemFS.ReadDir` silently returns an empty slice and `nil` error when querying non-existent directories, hiding missing folder issues during dry-runs.
- **Silent De-tracking Risk**: If `TrackedFileSystem` is initialized without an active transaction context (`t.tx` is `nil`), filesystem writes and deletions execute on disk but are silently omitted from the registry database.
- **Active Host Leaks during Dry-Run**:
  1. `LoadTypeScriptConfig` in `pkg/vm/loader.go` writes a physical temporary file `.dotfiles-loader-entry.ts` next to the user's config file via native `os.WriteFile`, violating dry-run boundaries.
  2. Injected JS VM bindings for `fileExists` and `detectLibc` delegate to host physical filesystem calls (`os.Stat`), probing the actual host instead of the virtualized sandbox.
- **SQLite Concurrency and Locking Risks**: Go establishes an SQL database pool with up to 10 connections. For SQLite, concurrent writes across different connections risk `SQLITE_BUSY` errors. TS uses single-threaded, single-connection synchronous queries to guarantee safety.

### B. Orchestration & Shell Sorter Gaps

- **Self-Dependency Cycle Crashes**: TS ignores self-dependencies (e.g. if a tool depends on its own binary). Go increments the dependency in-degree, leading to immediate false cycle crashes.
- **Disabled Tools Sorter Crashes**: TS prunes disabled tools before topological sorting. Go sorts first. If a disabled tool contains a circular, missing, or ambiguous dependency, Go will crash the program even though the tool is disabled.
- **Deterministic Sorter Tie-Breaking**: Both engines implement Kahn's algorithm with deterministic tie-breaking based on original configuration declaration index.
- **Dependency Fallback Robustness**: Go supports falling back directly to tool names when resolving dependencies, while TS strictly enforces binary providers, making Go more robust.
- **Zsh compinit Performance Degradation**: Go unconditionally appends `autoload -Uz compinit && compinit -u` to shell initialization scripts. This triggers heavy, slow disk scans on every single shell startup. TS prepends to `fpath` but leaves the `compinit` call to the user's config.
- **PowerShell Completions Omitted**: Go completely omits powershell support during shell completion file generation.
- **Copies Configuration Ignored**: While the `Copies` field exists in Go config structs, there is **zero implementation** for file copy operations in Go's orchestrator.
- **Once-Scripts Regeneration Pruning Gap**: Go loops from 1 to 1000 to speculatively find and delete once-scripts during generation. If once-scripts exceed 1000 or use a custom format/index padding, they leak. TS reads the directory dynamically and deletes all matching extension scripts safely.
- **Once-Scripts Deletion Robustness**: Go writes resilient, shell-native self-referencing cleanups (e.g., `rm -f "${(%):-%x}"` for Zsh) which resolve dynamically on execution, preventing stale absolute-path cleanups from polluting stdout as seen in TS.
- **Stale Tool State Drift (Lack of Cleanup)**: TS automatically runs cleanups (`cleanupToolArtifacts`, `cleanupStaleShims`, `cleanupStaleSymlinks`) during generation. Go lacks this pipeline; if a tool is disabled or its hostname no longer matches, Go simply continues past it, leaving all shims, symlinks, and files active on the user's disk.
- **Dead Code**: The package `pkg/unwrap` is fully compiled but remains completely unused and un-imported by any Go package or command.

---

## 4. Installer & Package Manager Gaps

### A. Individual Plugin Parity Gaps

- **Missing Global Binary Tracking**: Package managers (`brew`, `npm`, `apt`, `dnf`, `pacman`, `pkg`) return empty binary lists (`[]string{}`). No shims are generated for package-managed tools, and they are not recorded in the SQLite registry.
- **Absence of `shellInit` Hook**: The `shellInit` hook (which returns raw shell startup commands like `source "plugin.zsh"` for `zsh-plugin`) is completely missing in Go's installer contracts. Zsh plugins are cloned but never loaded in the user's shell. Additionally, Zsh plugins do not return shell-init configurations when bypassed (already installed).
- **Staging Clutter (Extraction Pollution)**: TS extracts archives inside a separate temporary directory, promoting only matched files to staging. Go extracts archives directly inside the staging folder, leaving readmes, licenses, and non-promoted files polluting the `current` path.
- **`curl-tar` Hardcoded Suffix Bug**: Go hardcodes the download file suffix as `.tar.gz`. If a `curl-tar` installer downloads a `.zip` or `.tar.xz`, it is saved as `.tar.gz`. Since Goja's extraction helper detects the format by extension, this causes extraction failures or panics.
- **`manual` Path Expansion Missing**: Go's `manual` installer fails to expand paths like `{stagingDir}`, preventing execution of local manual tool configs.
- **`curl-script` Lacks Binary Capture**: TS implements post-install binary capturing (moving binaries installed to global folders back to staging). Go lacks this, leaving physical binaries stranded on the system and un-promoted.
- **NPM Update Checks Stubbed**: `CheckUpdate` inside `npm.go` is a dummy stub returning `HasUpdate: false` immediately, preventing update checks for packages.
- **Cargo Sourcing Downgrades**: Go's Cargo installer only supports prebuilt quickinstall downloads or local compiler compilation, missing TS's support for parsing custom `cargo-toml` files and fetching prebuilt binaries via GitHub releases.

### B. Privilege Escalation & Sudo Gaps

- **Sudo Prompt Ignored**: Custom prompts defined in `system.sudoPrompt` are parsed but never passed to `sudo` commands (which requires `sudo -p`).
- **Interactive Hang risk**: Spawning `sudo` commands inside headless/non-interactive CI environments causes Go execution to hang indefinitely. Go's physical executor (`os_runner.go`) contains smart preflight checks, but headless CI builds still risk hanging on un-configured sudoers prompts.
- **Installer Sudo Support Validation**: Both Go and TS correctly enforce validation limits, ensuring only `apt`, `dnf`, `manual`, `pacman`, and `pkg` installers can request sudo permissions.

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### Active Test Files Comparison

| Test Objective               | TS Test Path (`packages/e2e-test/src/__tests__/`) | Go Test Path (`tests/e2e/`) | State / Coverage                    |
| :--------------------------- | :------------------------------------------------ | :-------------------------- | :---------------------------------- |
| **Conflicts Detection**      | `conflict.test.ts`                                | `conflict_test.go`          | **Functional Parity (Go is Green)** |
| **Dependencies Resolution**  | `dependency.test.ts`                              | `dependency_test.go`        | **Functional Parity (Go is Green)** |
| **Basic Installations**      | `install.test.ts`                                 | `install_test.go`           | **Functional Parity (Go is Green)** |
| **Stale Symlinks Cleanup**   | `symlinkStale.test.ts`                            | `symlink_stale_test.go`     | **Functional Parity (Go is Green)** |
| **Auto-Install Lifecycle**   | `autoInstall.test.ts`                             | `auto_install_test.go`      | **Functional Parity (Go is Green)** |
| **Enterprise GitHub Config** | `ghCli.test.ts`                                   | `gh_cli_test.go`            | **Functional Parity (Go is Green)** |
| **Tool Renaming State**      | `toolRename.test.ts`                              | `tool_rename_test.go`       | **Functional Parity (Go is Green)** |
| **Environment Activation**   | `env.test.ts`                                     | `env_test.go`               | **Functional Parity (Go is Green)** |
| **Hooks Execution**          | `hook.test.ts`                                    | `hook_test.go`              | **Functional Parity (Go is Green)** |
| **Language Type Safety**     | `typeSafety.test.ts`                              | _Missing_                   | **Missing Coverage (TS Only)**      |
| **Package Managers (APT)**   | `apt.test.ts`                                     | _Missing_                   | **Missing Coverage (TS Only)**      |

### Risks of Premature Demolition:

The risk of functional regressions in core installers is relatively low due to the extensive E2E integration test migrations. However, deleting TS before translating `typeSafety.test.ts` and `apt.test.ts` risks silent compiler and package manager breakages in user-authored configurations.

---

## 6. Completed vs. Remaining Backlog

### Completed Wave 7 Milestones

- **Direct esbuild compilation integration**: Embedded esbuild into `pkg/vm/loader.go` for native dynamic TS compiling.
- **Robust VM Context injection**: Passing complete context `ctx` (carrying `systemInfo`, `log`, sandboxed `fs`, and `$`) to `defineTool`.
- **E2E Integration Test translation**: Successfully migrated and ran all E2E tests in Go.
- **Dry-run symlink sandboxing**: Fixed host-level symlink leaks and redirected SQLite databases to `:memory:` on dry-runs.
- **Deep-merge on Platform Configs**: Resolved flat unmarshaling overwrite bugs in `bootstrap.go`.

### Remaining Wave 8 Active Backlog & Roadmap

To safely demolish TypeScript and transition to a pure statically-linked Go binary distribution:

1. **Ticket: Resolve TrackedFileSystem Recursive Remove State Bug**
   - Refactor `TrackedFileSystem.RemoveAll` to recursively list directory contents and write separate `rm` entries for all nested files.
2. **Ticket: Decouple Resource Binding in Installers via Optional Interfaces**
   - Refactor `pkg/installer/installer.go` to inject filesystems and loggers polymorphically via `SetFS` and `SetLogger` interface assertions.
3. **Ticket: Optimize TrackedFileSystem Write-Guard Memory Footprint**
   - Refactor content-checking in `TrackedFileSystem.WriteFile` to open files and stream-compare them in 4KB chunks, achieving constant $O(1)$ memory overhead.
4. **Ticket: Propagate Overwrite Configuration Safely via Context instead of Env**
   - Eliminate thread-unsafe `os.Setenv` mutations in `pkg/dashboard/routes.go` and propagate the overwrite/force flag safely via `context.Context`.
5. **Ticket: Repair Visual Dashboard `/api/tools` Response Schema**
   - Update `pkg/dashboard/routes.go` to construct and return nested `IToolDetail` payloads, preventing visual Preact UI crashes.
6. **Ticket: Incorporate Request Headers in Downloader Cache Keys**
   - Update `pkg/downloader/downloader.go` to include relevant request headers in the SHA-256 cache key, preventing authorization cache collisions.
7. **Ticket: Secure Archive Extractor Symlinks (Security Fix)**
   - Validate symlink targets inside `pkg/archive/archive.go` to ensure they do not escape the destination extraction boundary (Zip-Slip defense).
8. **Ticket: Rebuild `matchGlob` to Use Standard Glob Library**
   - Replace the custom, faulty regex compiler in `pkg/proxy/proxy.go` with a standard glob matching package to restore functional proxy cache invalidation.
9. **Ticket: Restore Runtime Type Definition Generation**
   - Implement copying/generating `.d.ts` type definitions (`schemas.d.ts`, `authoring-types.d.ts`) inside `cmd/dotfiles/generate.go` to restore editor Intellisense at runtime.
10. **Ticket: Standardize Once-Scripts Directory Pruning**
    - Replace the hardcoded loop (1 to 1000) inside the orchestrator with a dynamic filesystem `ReadDir` directory sweep.

---

# DUE DILIGENCE

During our deep-dive analysis, several structural, security, and quality issues were discovered:

- **Security Vulnerability (Arbitrary Symlink File-Write)**: `pkg/archive/archive.go` extracts archives inside the host environment without sanitizing symbolic link targets. This allows a malicious archive to write files outside the target directory (Zip-Slip variant).
- **Core Platform Matching Failure**: In `cmd/dotfiles/bootstrap.go`, platform bitmask matches are implemented via simplified integer comparisons (`platforms == 3`, `platforms == 7`). If a user configuration defines `platforms = 5` (Linux | Windows), Go fails to match on Linux, causing valid configurations to be skipped.
- **In-Memory Buffering Performance Hazard (Potential OOM)**: `pkg/archive/archive.go` reads entire archive headers and files into memory using `io.ReadAll` instead of streaming them with `io.Copy`, risking memory spikes and process crashes on large binary downloads.
- **Severe Symlink Host Leakage in Unit Tests**: Due to a preflight bypass in `bootstrap.go`, running unit tests with `dryRun = false` fails to initialize the virtual filesystem symlink evaluator. This causes test symlinks to bypass the `MemFS` memory sandbox and write physical symlinks directly to the developer's real host machine.
- **Double I/O and Redundant Logging**: Unlike TS, Go's `WriteFile` always issues writes and records duplicate SQLite tracking entries even if the file content on disk matches the payload exactly.
- **Dead Code**: The package `pkg/unwrap` is fully compiled but remains completely unused and un-imported by any Go package or command.
- **Uncompressed Tar Extract Gap**: Top-level `Extract()` inside `pkg/archive/archive.go` contains no dispatcher branch matching uncompressed `.tar` archives, throwing unrecognized format errors immediately on plain tars.
- **Hard Link Symlink Conversion Bug**: `pkg/archive/archive.go` handles symbolic links and hard links identically, extracting hard links as symlinks which breaks filesystem topologies.
- **Sub-process & Goroutine Leak**: `extractTarXz` inside `pkg/archive/archive.go` spawns a pipe writer subprocess but fails to close the pipe reader on early error paths, causing the subprocess to hang indefinitely as a zombie.
- **Missing File Attributes & Access Times**: The custom zip and tar extractors in Go discard original file modification times and UID/GID attributes, writing all files with current system "now" time.
- **Missing User-Agent Header on GitHub API**: Outgoing GitHub API requests in `pkg/installer/github.go` lack a `User-Agent` header, breaking GitHub guidelines and triggering arbitrary 403 Forbidden rejections under high-traffic routes.
