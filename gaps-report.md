# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

- **feasibility check: Can we delete TS and ship Go today without breaking anything?**
  **NO, absolutely not.** Demolishing the remaining TypeScript packages and distributing the compiled Go CLI to users today will cause immediate, severe, and silent failures across the runtime environment, the visual user experience, and the developer workflow:
  1. **Visual UI Dashboard Collapse**: The Preact-based visual dashboard will instantly crash with uncaught JavaScript errors (e.g., `TypeError: Cannot read properties of undefined (reading 'status')`) on startup. This occurs because the Go server's `/api/tools` endpoint returns flat integer platform bitmasks and flat tool summaries rather than the nested `IToolDetail` objects expected by the UI.
  2. **Autocomplete and Editor DX Collapse**: Deleting the TS packages without compiling and publishing a dedicated, clean ambient types package (`@alexgorbatchev/dotfiles`) will break autocomplete, type boundaries, and editor validations for all user-authored `.tool.ts` and `dotfiles.config.ts` configuration files.
  3. **Instant Runtime JSVM Hook Crashes**: Goja lacks registered native bindings for core filesystem mutators (`writeFile`, `mkdir`, `rm`). When configurations attempt to execute custom installation hooks using `ctx.fs.writeFile`, the VM instantly throws `TypeError: undefined is not a function` and terminates.
  4. **Platform-Specific Installer Silently Bypassed (The Enum Bug)**: TypeScript DSL configurations recommend comparing platform metadata using numeric bitmask enums (e.g., `ctx.systemInfo.platform === Platform.MacOS`). Goja's runtime context only injects flat string attributes (`os = "darwin"`), causing these platform checks to silently evaluate to `false` and skip installations without any warning.
  5. **Critical Downloader Cache Key Collision**: Go's downloader computes cache keys strictly by hashing the URL string alone, ignoring headers and tokens. This creates a critical security boundary leak where private files or tokens from different repositories/environments can collide and leak across tool boundaries.
  6. **Archive Extractor Gaps and Resource Leaks**: Extracting plain `.tar` archives throws unrecognized format errors immediately. For `.tar.xz` files, the extractor fails to close pipe readers on early error paths, causing the decompressor subprocess to hang indefinitely as a zombie and leak memory. Furthermore, hard links are incorrectly downgraded to symbolic links.
  7. **Host Directory Symlink Leaks during Tests**: A preflight bypass in `bootstrap.go` causes unit tests running with `dryRun = false` to skip initializing the virtual filesystem symlink evaluator, letting test symlinks bypass the `MemFS` sandbox and write physical symlinks directly to the developer's real machine.
  8. **Missing Release and Verification Pipeline**: `scripts/build/main.go` compiles the binaries but fails to check compiled size limits (budget of `26000 KB`) and entirely omits type-level TSD assertion checks, risking shipping broken typings or bloated binaries to npm.
- **Current Monorepo State**
  The repository is in a transitional, hybrid state. All core TypeScript packages (such as `@dotfiles/core`, `@dotfiles/config`, `@dotfiles/cli`, and 15+ installer packages) have been successfully demolished on the `agorbatchev/golang` branch. Only two TypeScript packages remain: `packages/dashboard` (the Preact client source code) and `packages/build` (the TS/Node-based build runner). The Go-native CLI (`cmd/dotfiles/`) executes configurations and hosts a static web server embedding client assets, but suffers from severe architectural and contract-level gaps.
- **Overall Migration Parity Score**
  **6.0 / 10** (Factual technical justification):
  - *JS/TS Execution Engine (5.5/10)*: Native `esbuild` and standard `sobek` VM integrations are highly performant, but missing filesystem mutators, platform enum mismatches, and parsing-time hook evaluation limits degrade utility.
  - *CLI Orchestration & Shell Scripts (5.0/10)*: Topological dependency sorters resolve Kahn's algorithm deterministically, but there is NO cleanup of disabled, stale, or orphaned tools (leaving obsolete shims/symlinks active). Once-script directory pruning relies on an expensive, fragile speculative 1-1000 loop, and Zsh compinit optimization is missing.
  - *Installer Plugins & Package Managers (6.5/10)*: All 15 installers are compiled in Go, but package managers return empty binary lists (preventing registry tracking and shim generation), and `shellInit` hooks are absent.
  - *Networking, Extractors & Proxy (5.5/10)*: Downloader caching lacks credential isolation, plain tar is unsupported, hard links are downgraded to symlinks, and subprocess leaks remain unresolved on error paths.
  - *Build and Typings Pipeline (5.0/10)*: Completely dependent on the legacy TS runner, size limits are unenforced, and TSD tests are missing.
- **Current Dual-Run Parity Status**
  The dual-run verification harness (`scripts/parity-harness/main.go`) was **retired and deleted** in Wave 6 because the core TS codebase was removed, so live dual-runs are no longer possible. While `bun check:ci` (typecheck/lint) and the Go E2E tests pass green, they are over-simplifying state validations, masking silent tracking failures, sandboxing bypasses, and visual console regressions.

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### A. The `.tool.ts` Authoring Experience (DX) & Type Boundary Completeness
- **Ambient Types Package Requirement**: Users writing local configuration scripts require autocompletion and IDE compiler validation. If we demolish the TS packages, the types must be compiled and distributed via an npm package named `@alexgorbatchev/dotfiles`.
- **Typings Gaps**: The Go type-generator (`scripts/typegen/main.go`) only outputs raw JSON-serializable TS interfaces (`types.gen.ts`). It completely omits the fluent builder DSL (such as `defineTool`, `.bin()`, `.version()`, `.dependsOn()`, `.zsh()`). While `pkg/vm/dsl-types.ts` and `loader-api.ts` define these in the Go workspace, they are not packaged or linked into a stable user-facing type boundary.
- **Async vs Sync Filesystem Mismatch**: The public `IFileSystem` interface declares asynchronous, promise-returning methods (e.g., `readFile(path: string): Promise<string>`). However, Goja's native binding pool registers `fsExists`, `fsReadDir`, and `fsReadFile` as purely synchronous functions.
- **Missing FS Mutation APIs**: Crucial file mutation methods specified in the public TS typings—specifically `writeFile`, `mkdir`, and `rm`—are completely missing from the Goja-bound VM runtime environment. Any user tool attempting to write, make directories, or remove files via the virtual filesystem context will fail at runtime with a `TypeError: undefined is not a function`.
- **Platform & Architecture Enums**: The type definitions dictate that users compare environment metadata using enums (`ctx.systemInfo.platform === Platform.MacOS`). In contrast, Goja's VM runtime context only injects primitive string representations (`"darwin"`, `"linux"`, `"amd64"`), making such platform checks evaluate to `false` silently.
- **Duplicate Type Declarations**: During build, `scripts/build/main.go` concatenates type interfaces from `dsl-types.ts` and extracted declarations, generating duplicate identifiers for `PlatformCallback`, `ArchCallback`, and `ShellCallback` inside `.dist/` declarations, breaking strict TS compilation.
- **Stale Dependencies**: The dashboard client package (`packages/dashboard/package.json`) contains stale references to deleted TypeScript monorepo workspace modules (e.g., `"@dotfiles/config": "workspace:*"`), breaking clean `bun install` executions in fresh environments.

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
- **Bitmask Serialization Gap**: The Go backend serializes `targetTool` (`config.ToolConfig`) directly to JSON, sending integer values (e.g., `platforms: 3`) directly to the Preact client. The client, expecting string arrays (e.g., `["Linux", "macOS"]`), fails to correctly render platform compatibilities on the UI.
- **Dead SSE Code**: A heavy Server-Sent Events (SSE) log broadcasting system exists in the Go server but remains entirely unused by the Preact client interface.

### D. Build and NPM Packaging Pipeline
- **TypeScript Dependency**: The assembly of `.dist/` is orchestrated entirely by `packages/build/src/build/build.ts` using Bun.
- **Demolition Redesign**: If we demolish TS, we must rewrite this build pipeline as a native Go script. The pipeline must:
  1. Trigger `bun build` to compile the Preact dashboard into `pkg/dashboard/dist` before building Go (as Go embeds these assets at compile time).
  2. Concatenate `pkg/vm/dsl-types.ts` and `pkg/vm/loader-api.ts` into a unified `schemas.d.ts` declaration for type distribution.
  3. Run cross-platform compilations for all target architectures and bundle them into native npm optional-dependency packages.
  4. Implement Go-native compiled binary size constraint validation (failing builds exceeding 26000 KB).
  5. Spawn TSD (`tsd` CLI) to run type-level test suites on generated declarations to verify type-check health.

---

## 3. Structural & Architectural Gaps

### A. Core File System & Database State

| TypeScript Method Signature / Concept | Go Counterpart Method / Package | Semantic Divergence / Architectural Gaps |
| :--- | :--- | :--- |
| `readFile(path, encoding?): Promise<string>` | `ReadFile(path string) ([]byte, error)` | Go returns raw byte arrays. Caller handles conversions. Encoding is assumed UTF-8. |
| `exists(path): Promise<boolean>` | `Exists(path string) (bool, error)` | TS returns a boolean (ignoring internal errors). Go returns `(bool, error)` to handle underlying system failures. |
| `rm(path, options?): Promise<void>` | `RemoveAll(path string) error` | TS `rm` has optional recursive parameters. Go uses `RemoveAll` explicitly. |
| `MemFileSystem.exists()` (Broken symlinks) | `MemFS.Exists()` (`pkg/fs/mem_fs.go`) | **Correctness Bug**: `MemFS.Exists` checks flat map key existence. If a broken symlink node exists, it returns `true`. Real OSFS and TS `MemFileSystem` follow links, returning `false` for broken symlinks. |
| `getRegisteredTools()` | `GetRegisteredTools()` | **Semantic Divergence**: Go runs `SELECT DISTINCT tool_name` (returning tools that ever had operations, even if all files are currently deleted). TS replays states in-memory, excluding tools with zero active files. |
| `Compact()` / `Validate()` | *None* | **Missing Features**: Go lacks the compaction and integrity-checking routines implemented in TS's `FileRegistry.ts`. |
| `RecordOperation` permissions format | `Permission` type (`pkg/db/`) | **Parity Achieved**: Go uses a custom SQL scanner/valuer to map octal permissions (e.g. `"0755"`) to decimal (e.g. `"493"`) in SQLite, matching TS binary representation perfectly. |

- **Tilde Home Path Expansion Collapse**: TS employs a `ResolvedFileSystem` wrapper to dynamically intercept and expand home shortcuts (`~` and `~/`) on all path arguments. In Go, `ExpandHomePath` exists as a utility but is **never invoked anywhere in the file system or installer pipeline**. Paths targeting `~` write literal folders named `~` in the current directory or fail on disk.
- **Recursive Directory Deletion Tracking Bug**: When recursively deleting folders via `fsys.RemoveAll`, Go's `TrackedFileSystem` only logs a single record for the parent folder. TS scanned the directory and wrote distinct `rm` records for all nested contents. This leaves all deleted nested files recorded as "active" in Go's SQLite registry, resulting in persistent database state drift.
- **Content Change Skip Optimization Gap**: TS's `TrackedFileSystem.writeFile` skips physical writes and database logging if the content has not changed. Go's `WriteFile` always overwrites and logs operations, resulting in redundant disk writes and duplicate SQLite tracking records.
- **MemFS Ordering Non-Determinism**: Go's `MemFS.ReadDir` iterates a standard Go map, returning directory elements in a non-deterministic random order. TS returns alphabetically sorted directory listings.
- **MemFS ReadDir Error Hiding**: Go's `MemFS.ReadDir` silently returns an empty slice and `nil` error when querying non-existent directories, hiding missing folder issues during dry-runs.
- **Silent De-tracking Risk**: If `TrackedFileSystem` is initialized without an active transaction context (`t.tx` is `nil`), filesystem writes and deletions execute on disk but are silently omitted from the registry database.
- **Active Host Leaks during Dry-Run**:
  1. `LoadTypeScriptConfig` in `pkg/vm/loader.go` writes a physical temporary file `.dotfiles-loader-entry.ts` next to the user's config file via native `os.WriteFile`, violating dry-run boundaries.
  2. Injected JS VM bindings for `fileExists` and `detectLibc` delegate to host physical filesystem calls (`os.Stat`), probing the actual host instead of the virtualized sandbox.
- **SQLite Concurrency and Locking Risks**: Go establishes an SQL database pool with up to 10 connections. For SQLite, concurrent writes across different connections risk `SQLITE_BUSY` errors. TS uses single-threaded, single-connection synchronous queries to guarantee safety.

### B. Orchestration & Shell Sorter Gaps
- **Bash once-script Initializer Subshell Bug**: Go generates the Bash once-script sourcing loop inside a subshell:
  ```bash
  (shopt -s nullglob; for once_script in "%q/*.sh"; do [[ -f "$once_script" ]] && source "$once_script"; done)
  ```
  **Critical Bug**: Wrapping the once-script initialization loop in parentheses forces execution inside a subshell. Sourced once-scripts cannot mutate the parent shell environment (e.g. setting global exports, defining aliases, or functions). TS runs the loop in-process, modifying and restoring `shopt` inline, thus preserving environment mutations.
- **Complete Omission of Custom Paths (`stc.Paths`)**: The Go orchestrator completely ignores `stc.Paths`! There is no loop, parsing, resolution, or generation of custom paths anywhere in `generateShellScripts`. Any user-configured path overrides defined in `.paths(...)` on tools are completely lost.
- **Missing Sourcing of Bash Completions**: While Go writes Bash completion files to `{shellScriptsDir}/bash/completions/<toolName>` during installation, **it never generates lines to source these completion files in the generated `main.bash`!** Only Zsh has completions directory setup in `generateShellScripts`. As a result, Bash completions in Go are completely broken and never loaded.
- **Arbitrary and Inefficient Once-Scripts Cleanup Loop**: Go's `once` scripts cleanup loops 1 to 1000 to speculatively find and delete once-scripts during generation. If once-scripts exceed 1000 or use a custom format/index padding, they leak. TS reads the directory dynamically (`readdir`) and deletes all matching extension scripts safely and efficiently.
- **Sorters Alphabetical ordering Discrepancy**: Go sorts the initial list of loaded configurations alphabetically before running topological sorting. This forces independent tools to load alphabetically, whereas TS maintains their definition order.
- **Disabled Tools Sorter Crashes**: TS prunes disabled tools before topological sorting. Go sorts first. If a disabled tool contains a circular, missing, or ambiguous dependency, Go will crash the program even though the tool is disabled.
- **Stale Tool State Drift (Lack of Cleanup)**: TS automatically runs cleanups (`cleanupToolArtifacts`, `cleanupStaleShims`, `cleanupStaleSymlinks`) during generation. Go lacks this pipeline; if a tool is disabled or its hostname no longer matches, Go simply continues past it, leaving all shims, symlinks, and files active on the user's disk.

### C. Networking, Extractors & Proxy Gaps
- **Infinite Network Socket Timeouts in Downloader**: Go's standard `NewDownloader` initiates an unconfigured `http.Client` with `0` timeout. A hanging network connection will freeze the CLI process indefinitely, causing silent pipeline hang-ups in headless CI environments.
- **Zombie Subprocess Leaks in `.tar.xz` Decompression**: In `extractTarXz`, if the `tarReader` loop returns an error or cancels early, the `io.PipeReader` is left open. The spawned `xz` background process will block indefinitely on a full buffer, leaking system resources.
- **Cache Key Scope Collisions**: The Go caching downloader builds keys solely from the request URL, neglecting caller headers. This can result in cross-credential cache hits or authorization leaks.
- **Hard Link Semantic Mutation**: Go's `extractTar` treats `tar.TypeLink` (hard links) identically to `tar.TypeSymlink`, creating symlinks instead of actual hard links.
- **Shared Asset Matcher Fragmentation**: The zinit-style asset matching engine (`selectBestMatch`) from TS's `@dotfiles/arch` is fragmented and duplicated inside individual installer plugins (`github.go`, `gitea.go`, `pkg.go`, and `dmg.go`) with differing feature sets. Simpler installers like Gitea lack pattern scoring, leading to extraction failures.
- **Linux Libc Matching Omission**: While `pkg/arch` has a highly accurate `DetectLibc` function, **none of the Go installer matching algorithms utilize it**. In contrast, TS `@dotfiles/arch` ranks Linux GNU vs Musl assets perfectly based on host libc.

---

## 4. Installer & Package Manager Gaps

### A. Individual Plugin Parity Gaps
- **Missing Global Binary Tracking**: Package managers (`brew`, `npm`, `apt`, `dnf`, `pacman`, `pkg`) return empty binary lists (`[]string{}`). No shims are generated for package-managed tools, and they are not recorded in the SQLite registry.
- **Absence of `shellInit` Hook**: Zsh plugins are cloned but never loaded in the user's shell because the `shellInit` hook is completely missing in Go's installer contracts.
- **Staging Clutter (Extraction Pollution)**: TS extracts archives inside a separate temporary directory, promoting only matched files to staging. Go extracts archives directly inside the staging folder, leaving readmes, licenses, and non-promoted files polluting the `current` path.
- **`curl-tar` Hardcoded Suffix Bug**: Go hardcodes the download file suffix as `.tar.gz`. If a `curl-tar` installer downloads a `.zip` or `.tar.xz`, it is saved as `.tar.gz`. Since Goja's extraction helper detects the format by extension, this causes extraction failures or panics.
- **`manual` Path Expansion Missing**: Go's `manual` installer fails to expand paths like `{stagingDir}`, preventing execution of local manual tool configs.
- **`curl-script` Lacks Binary Capture**: TS implements post-install binary capturing (moving binaries installed to global folders back to staging). Go lacks this, leaving physical binaries stranded on the system and un-promoted.
- **NPM Update Checks Stubbed**: `CheckUpdate` inside `npm.go` is a dummy stub returning `HasUpdate: false` immediately, preventing update checks for packages.
- **Cargo Sourcing Downgrades**: Go's Cargo installer only supports prebuilt quickinstall downloads or local compiler compilation, missing TS's support for parsing custom `cargo-toml` files and fetching prebuilt binaries via GitHub releases.
- **Zsh Plugin Auto-Sourcing Gap**: Go's `zsh_plugin.go` completely ignores the `auto` boolean parameter (defaults to `true` in TS), meaning Go will **always return shell initialization commands** (`source {pluginPath}/{sourceFile}`), even if the user explicitly requested `auto: false`.
- **Gitea Asset Pattern Filter Gap**: Go's `matchAsset` inside `gitea.go` completely ignores `assetPattern`! It performs a naive substring check for OS and Architecture names. If a Gitea release includes multiple files matching OS and Arch (such as both a `.deb` package and a `.tar.gz` archive), Go will return whichever matches first, resulting in extraction failures.

### B. Privilege Escalation & Sudo Gaps
- **Sudo Prompt Ignored**: Custom prompts defined in `system.sudoPrompt` are parsed but never passed to `sudo` commands (which requires `sudo -p`).
- **Interactive Hang risk**: Spawning `sudo` commands inside headless/non-interactive CI environments causes Go execution to hang indefinitely. Go's physical executor (`os_runner.go`) contains smart preflight checks, but headless CI builds still risk hanging on un-configured sudoers prompts.
- **Installer Sudo Support Validation**: Both Go and TS correctly enforce validation limits, ensuring only `apt`, `dnf`, `manual`, `pacman`, and `pkg` installers can request sudo permissions.

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### Active Test Files Comparison

| Test Objective | TS Test File Path (`packages/e2e-test/src/__tests__/`) | Go Test File Path (`tests/e2e/`) | State / Coverage |
| :--- | :--- | :--- | :--- |
| **Conflicts Detection** | `conflict.test.ts` | `conflict_test.go` | **Functional Parity (Go is Green)** |
| **Dependencies Resolution** | `dependency.test.ts` | `dependency_test.go` | **Functional Parity (Go is Green)** |
| **Basic Installations** | `install.test.ts` | `install_test.go` | **Functional Parity (Go is Green)** |
| **Stale Symlinks Cleanup** | `symlinkStale.test.ts` | `symlink_stale_test.go` | **Functional Parity (Go is Green)** |
| **Auto-Install Lifecycle** | `autoInstall.test.ts` | `auto_install_test.go` | **Functional Parity (Go is Green)** |
| **Enterprise GitHub Config**| `ghCli.test.ts` | `gh_cli_test.go` | **Functional Parity (Go is Green)** |
| **Tool Renaming State** | `toolRename.test.ts` | `tool_rename_test.go` | **Functional Parity (Go is Green)** |
| **Environment Activation** | `env.test.ts` | `env_test.go` | **Functional Parity (Go is Green)** |
| **Hooks Execution** | `hook.test.ts` | `hook_test.go` | **Functional Parity (Go is Green)** |
| **Dry Run Sandboxing** | _Missing_ | `dry_run_sandboxing_test.go` | **Go Advantage (Go is Green)** |
| **Language Type Safety** | `typeSafety.test.ts` | _Missing_ | **Missing Coverage (TS Only)** |
| **Package Managers (APT)** | `apt.test.ts` | _Missing_ | **Missing Coverage (TS Only)** |

### Risks of Premature Demolition
The risk of functional regressions in core installers is relatively low due to the extensive E2E integration test migrations. However, deleting TS before translating `typeSafety.test.ts` and `apt.test.ts` risks silent compiler and package manager breakages in user-authored configurations. Additionally, deleting `packages/build` immediately destroys the 17 installer TSD type assertion tests (which verify generated `.d.ts` declaration boundaries inside `.dist/`), exposing the repository to typing regressions in the distributed release.

---

## 6. Completed vs. Remaining Backlog

### Completed Wave 5 Milestones
- **Core Package Removals**: Deletion of `@dotfiles/core`, `@dotfiles/config`, `@dotfiles/cli`, and 15+ TS package manager installer directories.
- **CLI Compilation Integration**: Implemented Go CLI compile-time flags and configured static binary build scripting.
- **DB Operations Alignment**: Validated SQLite schema queries, WAL pragmas, and basic column alignment with Go structs.
- **First E2E Migrations**: Completed conversion of initial installation, dependency resolution, and basic config-parsing E2E tests.

### Active Open Wave 6 Tickets
The following 12 open Wave 6 tickets represent the sequential roadmap to safely demolish the remaining TypeScript packages and transition to a pure statically-linked Go binary distribution:

1. **Ticket 6.1 (FS & Sandboxing)**: Fix `MemFS.Exists` to follow symlinks correctly, returning `false` for broken symlinks, and resolve preflight test-sandboxing bypasses.
2. **Ticket 6.2 (Orchestration)**: Fix the Bash once-script initializer subshell environment isolation bug (execute loop in-process without subshell).
3. **Ticket 6.3 (Orchestration)**: Process and emit custom path directories (`stc.Paths`) within `generateShellScripts`.
4. **Ticket 6.4 (Orchestration)**: Generate sourcing loops inside `main.bash` to load compiled Bash completion files.
5. **Ticket 6.5 (Orchestration)**: Replace speculative 1-1000 once-scripts cleanup loop with dynamic directory reading (`ReadDir`).
6. **Ticket 6.6 (Installer Plugins)**: Fix Gitea `matchAsset` to respect `assetPattern` and filter assets correctly to prevent extraction failures.
7. **Ticket 6.7 (Installer Plugins)**: Fix Zsh plugin installer to respect the `auto: false` sourcing flag.
8. **Ticket 6.8 (Networking)**: Resolve Downloader infinite socket timeouts by setting a default client timeout.
9. **Ticket 6.9 (Networking)**: Prevent zombie decompressor subprocess leaks in `.tar.xz` by ensuring `io.PipeReader` is closed on error.
10. **Ticket 6.10 (Networking)**: Fix cache key generation to include authentication headers to prevent cache collisions.
11. **Ticket 6.11 (Architecture & DRY)**: Unify asset matching into `pkg/arch` (SelectBestMatch) and utilize Linux Libc detection.
12. **Ticket 6.12 (Dashboard & Build)**: Resolve platform configuration overrides bitmask serialization in `/api/tools`, write Go-native release packaging scripts, and delete `packages/build` and `packages/dashboard`.

---

## 7. Due Diligence

During our holistic audit of the repository, the following high-risk architectural, performance, security, and design issues were identified:

1. **Active Host De-tracking / Silent Failures**: If `TrackedFileSystem` is initialized without a transaction context (`t.tx` is `nil`), all file mutations write successfully to the user's disk but are **silently omitted** from the SQLite registry. This leaves the database in a stale state and prevents clean uninstalls.
2. **Recursive Folder Deletion SQLite State Drift**: When a folder is deleted recursively, Go's `TrackedFileSystem.RemoveAll` (unlike TS) only logs a single `rm` record for the parent folder. This leaves all deleted nested files recorded as "active" in Go's SQLite registry, resulting in permanent database state drift.
3. **No-Change File Overwrite Redundancy**: TS's `TrackedFileSystem.writeFile` skips physical writes and database logging if the file content has not changed. Go's `WriteFile` always overwrites and logs operations, resulting in redundant disk wear and duplicate SQLite records.
4. **MemFS Non-Determinism and Broken Symlink Semantics**:
   - `MemFS.ReadDir` iterates a standard Go map, returning directory elements in a non-deterministic random order, whereas TS returns alphabetically sorted directory listings.
   - Calling `Exists` on a broken symlink inside Go's `MemFS` returns `true` (by looking up the symlink node itself) instead of following the symlink to the target and returning `false`.
5. **Lack of Typed Structs in Go Dashboard Server API**: The `/api/tools` route handler inside `pkg/dashboard/routes.go` maps registry data directly to an untyped generic `map[string]any` inside `getToolDetail` (`runtimeState := map[string]any{ ... }`). This bypasses Go's strict compiler typing, risking silent API drift between Go and Preact.
6. **Stale Workspace Dependencies in Dashboard `package.json`**: `packages/dashboard/package.json` retains references to deleted TypeScript monorepo workspace modules under dependencies and devDependencies (e.g. `"@dotfiles/config": "workspace:*"`), breaking clean `bun install` executions.
7. **Dead Code**: The package `pkg/unwrap` is fully compiled and tested but remains completely unused and un-imported by any Go package or command.
8. **Divergent Zsh Plugin Sourcing**: In TS, the orchestrator retrieves Zsh-plugin sourcing details dynamically via an installer hook. In Go, the orchestrator bypasses this abstraction and implements hardcoded candidate checks (`pluginName + ".plugin.zsh"`, `"init.zsh"`, etc.) directly inside `pkg/orchestrator/orchestrator.go`. This breaks plugin boundaries.
9. **Infinite Network Socket Timeouts**: Go's `NewDownloader` creates an empty `http.Client` with no timeout, meaning a hanging remote server will block the CLI process indefinitely (particularly risky in headless CI).
10. **Custom Sudo Prompt Ignored**: Go's command executor parses but completely ignores custom sudo prompts defined in `system.sudoPrompt` (which requires passing `-p` to `sudo`).
