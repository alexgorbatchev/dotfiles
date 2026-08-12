# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

### Core Feasibility Check
**Can we delete the TypeScript implementation and ship the Go CLI to users today without breaking anything?**

**NO. We CANNOT delete the TypeScript implementation and ship the Go CLI today.** 

While the Go implementation has achieved impressive core parity—passing 100% of the 20 migrated E2E integration test suites and executing `.tool.ts` configurations via an embedded Goja (Sobek) JS VM—deleting TypeScript today would introduce severe regressions:

1. **Dangling Orphaned and Stale Artifacts**: Go's orchestrator (`pkg/orchestrator/orchestrator.go`) lacks orphaned tool and stale artifact cleanup (`cleanupOrphanedTools`, `cleanupStaleShims`, `cleanupStaleSymlinks`). Modifying `.bin()` declarations or deleting `.tool.ts` files leaves broken shims, symlinks, and completion scripts permanently in `~/.dotfiles/.generated/target/bin`.
2. **Incomplete CLI Surface**: Go's CLI (`cmd/dotfiles`) lacks essential global flags (`--platform`, `--arch`, `--libc`, `--verbose`, `--quiet`) and 6 subcommands (`bin`, `features`, `cleanup`, `check-updates`, `log`, `skill`).
3. **`curl-script` System Binary Promotion Failure**: `pkg/installer/curl_script.go` searches only inside the tool's local `destDir`. Scripts installing binaries to standard system locations (`/usr/local/bin`, `~/.local/bin`, `/usr/bin`) fail binary promotion.
4. **Multi-Line Import Parsing Bug**: `EvaluateToolDefinition` in `pkg/vm/vm.go` uses line-based prefix stripping (`strings.HasPrefix(trimmed, "import ")`), which corrupts multi-line TypeScript `import` blocks.
5. **Stubbed Dashboard Features**: The `/api/tools/:name/check-update` endpoint in `pkg/dashboard/routes.go` is stubbed (`{"hasUpdate": false}`), breaking visual update checks in the web GUI.
6. **Incomplete Asset Filtering (`pkg/arch`)**: Advanced zinit soft/hard regex filtering, non-binary asset exclusion (`.sha256`, `.asc`), and glibc vs. musl ranking from `packages/arch` are missing from Go's installer selection logic.

---

### Current Monorepo State
The repository is currently in a **Wave 6-9 Transitional Hybrid State**:
- The main CLI entry points (`bun check:ci`, package scripts) delegate execution directly to the Go CLI (`cmd/dotfiles`), the Go build orchestrator (`scripts/build/main.go`), and Go E2E tests (`tests/e2e/`).
- TypeScript source packages (`packages/*`) remain in the tree as reference baselines, for ambient `.d.ts` type distribution (`.dist/schemas.d.ts`), and for running `tsd` type contract tests.
- All 20 TypeScript E2E integration test suites (`packages/e2e-test/src/__tests__/`) have been fully translated to native Go tests (`tests/e2e/*.go`).

---

### Overall Migration Parity Score: 8.5 / 10

| Component / Subsystem | Parity Score | Hard Technical Justification |
| :--- | :---: | :--- |
| **Core Storage, DB & FS** | **9.5 / 10** | Pure-Go SQLite (`modernc.org/sqlite`), WAL pragmas, thread-safe connection pooling, transaction enforcements, and permission serialization (octal string <-> base-10 integer) are 100% matched. Minor gap: `MemFS.ReadDir` map iteration order non-determinism. |
| **JS VM & DSL Execution** | **9.0 / 10** | Goja (Sobek) + `esbuild` evaluates `.tool.ts` and `dotfiles.config.ts` accurately. Type generation (`scripts/typegen/main.go`) passes `tsd` type tests. Gap: line-prefix import stripping on multi-line imports. |
| **Installer Plugins (15)** | **8.5 / 10** | All 15 installers functional with dry-run sandboxing, sudo validation, and platform detection. Gaps: `curl-script` system binary path resolution, missing `ExternallyManaged()` interface method, `brew` service boolean casting. |
| **Orchestration & CLI** | **7.5 / 10** | Topological sorter (Kahn's algorithm with tie-breaking) matches TS. Critical gaps: missing orphaned/stale artifact cleanup, missing global CLI flags (`--platform`, `--arch`), and 6 missing CLI subcommands. |
| **Dashboard & Web GUI** | **8.5 / 10** | Preact/Tailwind client embedded via `//go:embed`. 15 of 16 REST routes fully functional. Gap: `/api/tools/:name/check-update` returns a hardcoded stub. |
| **Build & Release Pipeline**| **9.0 / 10** | `scripts/build/main.go` handles React compilation, typegen, `.dist/` packaging, `cli.js` launcher emission, and binary size verification (<26MB). |

---

### Current Dual-Run Parity Status (`bun check:ci` Analysis)

`bun check:ci` passes cleanly:
1. `bun lint` (`oxfmt --check .`, `dprint check`, `oxlint .`) -> **PASS**
2. `bun typecheck` (`tsgo -p tsconfig.json`) -> **PASS**
3. `bun test:native` (`go test -count=1 -p 1 ./tests/e2e/...`) -> **PASS** (20/20 test suites pass in ~7.0s)
4. `go test ./pkg/... ./cmd/... ./scripts/...` -> **PASS** (All Go unit tests pass)

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### A. The `.tool.ts` Authoring Experience (DX) & Type Boundary
- **Type Boundary Completeness**: All public DSL types (`defineTool`, `defineConfig`, `IFileSystem`, `ISystemInfo`, `Platform`, `Architecture`, installer parameters, shell configurators) are defined in `pkg/vm/dsl-types.ts` and exported into generated TypeScript declaration files (`.dist/schemas.d.ts`, `.dist/authoring-types.d.ts`, `.dist/tool-types.d.ts`).
- **IDE Autocomplete & Design-Time Support**: User `.tool.ts` files importing `@alexgorbatchev/dotfiles` resolve type signatures cleanly against `.dist/schemas.d.ts`.
- **Runtime Execution**: Goja VM in `pkg/vm/loader.go` executes user `.tool.ts` files natively during `dotfiles generate` and `install`. In addition, `.dist/cli.js` exports design-time JS stub implementations (`defineTool`, `defineConfig`) so Node/Bun tools can evaluate config files if required.
- **Verification**: `scripts/build/main.go` includes an automated `runTypeTests()` step that runs `tsd` against `packages/build/type-tests/` to guarantee type boundary validity before compiling distributables.

### B. Dashboard Client & Backend Server
- **Endpoint Parity**: 15 of 16 REST API endpoints required by the Preact/React client (`packages/dashboard/src/client/`) are fully implemented in Go (`pkg/dashboard/routes.go`):
  - `GET /api/stats`
  - `GET /api/config`
  - `GET /api/health`
  - `GET /api/activity`
  - `GET /api/recent-tools`
  - `GET /api/shell`
  - `GET /api/tool-configs-tree`
  - `GET /api/tools`
  - `GET /api/tools/:name`
  - `GET /api/tools/:name/history`
  - `GET /api/tools/:name/readme`
  - `GET /api/tools/:name/source`
  - `POST /api/tools/:name/install`
  - `POST /api/tools/:name/update`
- **Gap**: `POST /api/tools/:name/check-update` is stubbed to return `{"hasUpdate": false}` instead of triggering a live update check against the installer plugin's `CheckUpdate()` method.
- **Static Asset Embedding**: `pkg/dashboard/dashboard.go` uses `//go:embed all:dist` to embed compiled React client assets directly into the compiled Go binary. `scripts/build/main.go` invokes `bun build` on `packages/dashboard/src/client/dashboard.html` to populate `pkg/dashboard/dist/` prior to Go binary compilation.

### C. The Build and NPM Packaging Pipeline
- **Single Orchestrator**: `scripts/build/main.go` serves as the build pipeline orchestrator, eliminating dependence on legacy Node build packages (`packages/build`).
- **Pipeline Workflow**:
  1. Compiles React dashboard client (`bun build`).
  2. Runs typegen (`go run scripts/typegen/main.go`) to output `packages/dashboard/src/shared/types.gen.ts`.
  3. Assembles `.dist/schemas.d.ts`, `authoring-types.d.ts`, and `cli.d.ts`.
  4. Emits cross-platform Node/Bun launcher `cli.js` (spawns native compiled Go binary or falls back to platform npm package).
  5. Generates root `.dist/package.json` (`@alexgorbatchev/dotfiles`) and platform subpackages (`@alexgorbatchev/dotfiles-darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`).
  6. Compiles native Go binary and cross-compiles all 4 target binaries with `CGO_ENABLED=0` and `-ldflags="-s -w"`.
  7. Runs `tsd` type tests and verifies binary size limits (<26MB per binary).

---

## 3. Structural & Architectural Gaps

### Comparison Table: Go Methods/Functions vs. TS Predecessors

| Domain | Go Implementation (`pkg/*`, `cmd/*`) | TS Predecessor (`packages/*`) | Discrepancy & Parity Status |
| :--- | :--- | :--- | :--- |
| **Virtual File System** | `MemFS` (`pkg/fs/mem_fs.go`) | `MemFileSystem` (`packages/file-system`) | **Order Non-Determinism**: Go `MemFS.ReadDir` iterates over `map[string]*fileNode` without sorting, returning entry slices in non-deterministic order. |
| **Data Layer & DB** | `Registry` & `NewConnection` (`pkg/db`, `pkg/registry`) | `RegistryDatabase` & `FileRegistry` | **Match**: Both use SQLite WAL mode, 5000ms busy timeout, base-10/octal permission conversion, and explicit atomic transaction locks (`ErrTransactionRequired`). |
| **HTTP Downloader** | `Downloader` (`pkg/downloader/downloader.go`) | `Downloader` (`packages/downloader`) | **Proxy Configuration Gap**: TS accepted `IProxyFetchConfig` struct directly. Go relies on HTTP transport environment settings (`HTTP_PROXY`/`HTTPS_PROXY`). |
| **Archive Extraction** | `Extractor` (`pkg/archive/archive.go`) | `ArchiveExtractor` (`packages/archive-extractor`) | **Subprocess Safety**: Go uses stdlib streams for zip/tar/gzip/bzip2 and external processes for `.tar.xz`, `.dmg`, `.pkg`. `xz` pipeline requires explicit pipe cleanup on cancellation to prevent zombie process hangs. |
| **Orchestrator** | `TopologicalSort` (`pkg/orchestrator/orchestrator.go`) | `orderToolConfigsByDependencies.ts` | **Missing Cleanup Logic**: Go lacks `cleanupOrphanedTools()`, `cleanupStaleShims()`, `cleanupStaleSymlinks()`, and `cleanupStaleCopies()`. |
| **CLI Commands** | `cmd/dotfiles/*` | `packages/cli/*` | **Missing Commands & Flags**: Missing `--platform`, `--arch`, `--libc`, `--verbose`, `--quiet` flags and `bin`, `features`, `cleanup`, `check-updates`, `log`, `skill` subcommands. |
| **Architecture Matcher** | `pkg/arch/arch.go` | `packages/arch/*` | **Incomplete Matching Logic**: Missing zinit soft/hard pattern filters, non-binary file filters, and glibc/musl asset ranking. |
| **Features & Catalog** | `pkg/features/readme.go` | `packages/features/src/readme-service/*` | **Missing Catalog Generator**: Missing remote GitHub README fetching, `generateCatalogFromConfigs`, `generateCombinedReadme`, and `CATALOG.md` output. |

---

## 4. Installer & Package Manager Gaps

### Exhaustive 15-Installer Audit

| Installer Plugin | Sudo Support (`supportsSudo`) | Uninstallation Support | Custom Parameters & Features | Identified Parity Gaps & Edge Cases |
| :--- | :---: | :---: | :--- | :--- |
| **`apt`** | `true` | Implemented | `package`, `update`, `version` | Lacks pre-flight `command -v apt-get` / `dpkg-query` OS validation. Falls back to `/usr/bin/<binName>` if `which` fails. |
| **`brew`** | `false` | Implemented | `formula`, `cask`, `tap`, `args`, `link`, `service` | `versionRegex` pattern filtering is not applied to `versionArgs` CLI output. Boolean `service: true` fails type cast. |
| **`cargo`** | `false` | Implemented | `crateName`, `binarySource`, `sha256` | Falls back from `cargo-quickinstall` to local compilation cleanly. `CheckUpdate()` returns dummy `HasUpdate: false`. |
| **`curl-binary`**| `false` | Implemented | `url`, `sha256` | `chmod +x` executed best-effort. Lacks Zod URL schema validation. |
| **`curl-script`**| `false` | Implemented | `url`, `shell`, `args`, `env`, `versionArgs` | **CRITICAL GAP**: Go only searches inside `destDir`. Installers placing binaries in `/usr/local/bin` or `~/.local/bin` fail binary promotion. |
| **`curl-tar`** | `false` | Implemented | `url`, `sha256` | Uses multi-stage extension detector (URL suffix, path, `Content-Disposition`, `Content-Type`). |
| **`dmg`** | `false` | Implemented | `source`, `appName`, `binaryName`, `binaryPath` | macOS gate (`OS == "darwin"`). Uses `defer` for `hdiutil detach` and mount directory cleanup. |
| **`dnf`** | `true` | Implemented | `package`, `refresh` | Queries installed RPM version via `rpm -q`. Parses `dnf list --upgradable` for updates. |
| **`gitea`** | `false` | Implemented | `instanceUrl`, `repo`, `token` | Queries REST API `/api/v1/repos/{owner}/{repo}/releases/latest`. |
| **`github`** | `false` | Implemented | `repo`, `assetPattern`, `token` | Uses scored asset selector. Lacks fallback to `gh release download` CLI when GitHub API rate limit is reached. |
| **`manual`** | `true` | Implemented | `binaryPath` | Resolves `{homeDir}` placeholders. Supports config-only tools cleanly. |
| **`npm`** | `false` | Implemented | `packageManager`, `package`, `force` | Resolves global install directory via `bun pm bin -g` or `npm config get prefix`. |
| **`pacman`** | `true` | Implemented | `package`, `sysupgrade` | Parses `pacman -Qu` for updates and `pacman -Q` for installed version. |
| **`pkg`** | `true` | No-Op | `source`, `target` | macOS gate (`OS == "darwin"`). Executes `sudo installer -pkg <path> -target <target>`. |
| **`zsh-plugin`** | `false` | Implemented | `repo`, `url`, `pluginName` | Handles `git clone` and `git pull --ff-only`. Emits `source "<path>"` shell initialization. |

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### E2E Test Mapping Matrix

100% of active TypeScript E2E integration test suites (`packages/e2e-test/src/__tests__/`) have been fully translated to Go (`tests/e2e/*.go`):

| Legacy TypeScript Test File (`packages/e2e-test/src/__tests__/`) | Translated Go Native Test File (`tests/e2e/`) | Execution Status |
| :--- | :--- | :---: |
| `auto-install.test.ts` | `auto_install_test.go` | **PASS** |
| `completion.test.ts` | `completion_test.go` | **PASS** |
| `conflict.test.ts` | `conflict_test.go` | **PASS** |
| `dependency.test.ts` | `dependency_test.go` | **PASS** |
| `dnf.test.ts` | `dnf_test.go` | **PASS** |
| `dry-run.test.ts` | `dry_run_sandboxing_test.go` | **PASS** |
| `env.test.ts` | `env_test.go` | **PASS** |
| `files.test.ts` | `files_test.go` | **PASS** |
| `generate.test.ts` | `generate_test.go` | **PASS** |
| `gh-cli.test.ts` | `gh_cli_test.go` | **PASS** |
| `gitea-release.test.ts` | `gitea_release_test.go` | **PASS** |
| `hook.test.ts` | `hook_test.go` | **PASS** |
| `install.test.ts` | `install_test.go` | **PASS** |
| `pacman.test.ts` | `pacman_test.go` | **PASS** |
| `pkg.test.ts` | `pkg_test.go` | **PASS** |
| `symlink-stale.test.ts` | `symlink_stale_test.go` | **PASS** |
| `tool-rename.test.ts` | `tool_rename_test.go` | **PASS** |
| `trace.test.ts` | `trace_test.go` | **PASS** |
| `update.test.ts` | `update_test.go` | **PASS** |
| `version-detection.test.ts` | `version_detection_test.go` | **PASS** |

### Demolition Test Risks
- **E2E Integration Test Risk**: **ZERO**. All 20 integration test suites run natively in Go in ~7.0s during `bun check:ci`.
- **Unit Test Coverage Risk**: **LOW**. 47 Go unit test files cover `pkg/*`. However, edge-case unit tests for `curl-script` system binary locations, multi-line `import` blocks in `pkg/vm`, and map sorting in `MemFS` should be added before TypeScript source deletion.

---

## 6. Completed vs. Remaining Backlog

### Completed Waves (Waves 1–9 Summary)
- **Wave 1–3**: Core file system abstractions (`OSFS`, `MemFS`), SQLite schema migrations and WAL pragmas, Sobek/Goja JS VM integration, and shell emissions.
- **Wave 4–5**: 15 installer plugins, E2E test suite migration (20/20 tests), tracked filesystem state recording, permission octal/decimal translation, and Cobra CLI bootstrap.
- **Wave 6–9**: Cross-platform Node launcher (`cli.js`), pure-Go binary compilation (`CGO_ENABLED=0`), `tsd` type contract tests, Web dashboard API routes (15/16 routes), archive symlink security checks, and process substitution fixes.

---

### Remaining Wave 10 Open Tickets

To safely demolish the TypeScript source tree and distribute the Go CLI as a pure, statically-linked binary, the following open Wave 10 tickets must be resolved sequentially:

1. **`2026-06-29-wave-10-implement-stale-disabled-and-orphaned-tool-cleanups.md`**
   - *Scope*: Implement `cleanupOrphanedTools`, `cleanupStaleShims`, `cleanupStaleSymlinks`, and `cleanupStaleCopies` in `pkg/orchestrator/orchestrator.go`.
2. **`2026-06-29-wave-10-complete-installer-and-shell-features-parity.md`**
   - *Scope*: Fix `curl-script` system binary search paths (`/usr/local/bin`, `~/.local/bin`), implement `ExternallyManaged()` on `Installer` interface, fix `brew` service boolean casting, and add missing CLI flags/subcommands to `cmd/dotfiles`.
3. **`2026-06-29-wave-10-enforce-memfs-non-deterministic-ordering-and-symlink-semantics.md`**
   - *Scope*: Add deterministic sorting (`sort.Strings`) to `MemFS.ReadDir()` in `pkg/fs/mem_fs.go`.
4. **`2026-06-29-wave-10-repair-visual-dashboard-api-response-schema.md`**
   - *Scope*: Connect `/api/tools/:name/check-update` in `pkg/dashboard/routes.go` to the installer `CheckUpdate()` engine.
5. **`2026-06-29-wave-10-resolve-jsvm-filesystem-async-and-write-api-mismatch.md`**
   - *Scope*: Fix multi-line import stripping in `EvaluateToolDefinition` in `pkg/vm/vm.go`.
6. **`2026-06-29-wave-10-build-go-native-release-packaging-pipeline.md`**
   - *Scope*: Finalize TypeScript source deletion (`rm -rf packages/*`), update root `package.json` to publish statically compiled binaries, and verify `bun check:ci` in a pure Go workspace.

---

## 7. Due Diligence Findings

# DUE DILIGENCE

During this holistic line-by-line audit across all Go packages (`pkg/*`, `cmd/*`, `scripts/*`) and TypeScript workspace packages (`packages/*`), 16 critical, high, and medium-severity due diligence issues were identified. These issues must be addressed during Wave 10 before TypeScript packages are demolished:

### 1. `MemFS.ReadDir` Map Iteration Non-Determinism (`pkg/fs/mem_fs.go`)
- **Severity / Category**: Medium / Core Correctness & Determinism
- **Issue**: `MemFS.ReadDir` iterates over Go's internal `m.files map[string]*fileNode`. Because Go randomizes map iteration order by design, repeated calls to `ReadDir` return directory entries in non-deterministic order. In contrast, Node/Bun virtual filesystems maintain stable key insertion/alphabetical order.
- **Impact**: Tests, CLI outputs, or directory tree walks operating against `MemFS` produce unstable, non-reproducible outputs across runs.
- **Fix**: Add explicit sorting (`sort.Slice` by name) prior to returning entry slices in `pkg/fs/mem_fs.go`.

### 2. Subprocess Pipe Leak & Zombie Risk in `extractTarXz` (`pkg/archive/archive.go`)
- **Severity / Category**: High / Process Stability & Goroutine Leaks
- **Issue**: `extractTarXz` spawns an `xz -d -c` decompressor subprocess feeding an `io.PipeWriter` inside a goroutine. If the outer context is canceled, `pr.Close()` is invoked, but if the `xz` process blocks on `pw.Write()`, the goroutine hangs indefinitely because `pw.CloseWithError(ctx.Err())` is not called.
- **Impact**: Subprocess pipelines leak zombie processes and uncollected goroutines when archives are canceled or fail mid-extraction.
- **Fix**: Ensure `pw.CloseWithError(ctx.Err())` is executed on context cancellation or error in `pkg/archive/archive.go`.

### 3. Downloader Proxy Configuration Option Bypass (`pkg/downloader/downloader.go`)
- **Severity / Category**: Low / Feature Parity
- **Issue**: TypeScript's `Downloader` accepted an explicit `IProxyFetchConfig` struct to route download traffic directly through the local HTTP proxy (`packages/http-proxy`). Go's `Downloader` relies solely on standard `HTTP_PROXY`/`HTTPS_PROXY` environment variables or custom `http.Client` transport settings rather than supporting a dedicated proxy configuration option in `DownloadOptions`.
- **Impact**: Code relying on programmatic proxy binding must set process environment variables rather than passing typed proxy options.
- **Fix**: Add an explicit `ProxyURL string` field to `DownloadOptions` in `pkg/downloader/downloader.go`.

### 4. Missing Stale & Orphaned Artifact Cleanup in Orchestrator (`pkg/orchestrator/orchestrator.go`)
- **Severity / Category**: Critical / Core Orchestration & System State Safety
- **Issue**: In TypeScript, running `dotfiles generate` automatically invoked `cleanupOrphanedTools()`, `cleanupStaleShims()`, `cleanupStaleSymlinks()`, and `cleanupStaleCopies()`. Go's orchestrator currently lacks all four cleanup methods.
- **Impact**: Deleting a `.tool.ts` configuration or modifying its `.bin()` declarations leaves dangling, broken shims, symlinks, and completion scripts in `~/.dotfiles/.generated/target/bin` permanently.
- **Fix**: Implement orphaned tool and stale artifact cleanup routines in `pkg/orchestrator/orchestrator.go` (tracked in Wave 10 ticket `2026-06-29-wave-10-implement-stale-disabled-and-orphaned-tool-cleanups.md`).

### 5. Missing Global CLI Flags in Go Entrypoint (`cmd/dotfiles/root.go`)
- **Severity / Category**: High / CLI Interface Parity
- **Issue**: Cobra CLI definition in `cmd/dotfiles/root.go` lacks standard TypeScript global flags: `--platform`, `--arch`, `--libc`, `--verbose`, and `--quiet`.
- **Impact**: Automation scripts and cross-platform test suites passing `--platform=darwin` or `--verbose` fail under the Go binary with unknown flag errors.
- **Fix**: Bind missing flags to Cobra global persistent flags in `cmd/dotfiles/root.go`.

### 6. Missing CLI Subcommands in Go Entrypoint (`cmd/dotfiles`)
- **Severity / Category**: High / CLI Feature Completeness
- **Issue**: The Go binary is missing 6 CLI subcommands present in TypeScript (`packages/cli/src/commands/`): `bin`, `features`, `cleanup`, `check-updates`, `log`, and `skill`.
- **Impact**: Command-line callers attempting to inspect binaries (`dotfiles bin`), run standalone cleanup (`dotfiles cleanup`), check for updates (`dotfiles check-updates`), or manage AI skills (`dotfiles skill`) receive command not found errors.
- **Fix**: Implement Cobra command handlers for all 6 missing subcommands under `cmd/dotfiles/`.

### 7. `curl-script` System Binary Path Resolution Deficit (`pkg/installer/curl_script.go`)
- **Severity / Category**: High / Installer Reliability & Binary Promotion
- **Issue**: TypeScript's `handleBinaryInstallation` searched system installation directories (`/usr/local/bin`, `~/.local/bin`, `/usr/bin`) and promoted newly created binaries to `context.stagingDir`. Go's `CurlScriptInstaller` searches ONLY inside `c.BinDir` (`destDir`).
- **Impact**: Installation scripts (such as `rustup`, `nvm`, or custom shell installers) that place binaries directly into `/usr/local/bin` or `~/.local/bin` succeed at execution but fail binary promotion in Go, leaving no generated shims.
- **Fix**: Update `pkg/installer/curl_script.go` to search standard system binary locations when `destDir` search yields no binaries.

### 8. Missing `ExternallyManaged()` Method on Go `Installer` Interface (`pkg/installer/installer.go`)
- **Severity / Category**: Medium / System Contract & Lifecycle Parity
- **Issue**: In TypeScript, package manager installers (`brew`, `apt`, `dnf`, `pacman`, `npm`) declare `externallyManaged: true` to prevent the generator from attempting to manage or delete system-managed binaries. In Go, the `Installer` interface lacks `ExternallyManaged() bool`.
- **Impact**: System-managed tools could be subjected to incorrect shim reconciliation or invalid state tracking.
- **Fix**: Add `ExternallyManaged() bool` to the `Installer` interface in `pkg/installer/installer.go`.

### 9. `brew` Installer Version Regex & Service Boolean Handling (`pkg/installer/brew.go`)
- **Severity / Category**: Low / Plugin Parity
- **Issue**: `pkg/installer/brew.go` does not apply `versionRegex` pattern matching to `versionArgs` CLI output. Furthermore, passing a boolean `service: true` configuration fails a type cast to string rather than defaulting to `"start"`.
- **Impact**: Homebrew formula update checks with custom version regex fail, and boolean service configs error during evaluation.
- **Fix**: Update `pkg/installer/brew.go` to apply regex extraction and support boolean service parameter casting.

### 10. `github` Installer CLI Fallback Deficit (`pkg/installer/github.go`)
- **Severity / Category**: Medium / Fallback Resiliency
- **Issue**: TypeScript's GitHub installer included `GhCliApiClient`, falling back to `gh release download` CLI when GitHub REST API rate limits were exhausted. Go's `github.go` relies strictly on direct HTTP requests to `api.github.com`.
- **Impact**: Installations fail during CI or heavy usage when GitHub unauthenticated rate limits (60 req/hr) are reached and no token is provided.
- **Fix**: Implement `gh` CLI fallback in `pkg/installer/github.go` when HTTP API returns 403 Rate Limit Exceeded.

### 11. Multi-Line Import Stripping Bug in Single-Script Evaluation (`pkg/vm/vm.go`)
- **Severity / Category**: High / JS VM Execution Correctness
- **Issue**: `EvaluateToolDefinition` in `pkg/vm/vm.go` strips TypeScript imports using line-prefix checking (`strings.HasPrefix(trimmed, "import ")`). Multi-line import blocks (e.g., `import {\n  defineTool\n} from ...`) have only their first line stripped, leaving invalid syntax (`defineTool\n} from ...`) in the JS script passed to Goja.
- **Impact**: Single-file `.tool.ts` evaluation fails with Goja JS syntax errors when multi-line import statements are used.
- **Fix**: Replace line-prefix checking with AST-aware or block-based import removal regex in `pkg/vm/vm.go`.

### 12. Incomplete Architecture Matching Logic in `pkg/arch/arch.go`
- **Severity / Category**: Medium / Feature Parity
- **Issue**: TypeScript's `packages/arch` provided zinit soft/hard regex pattern filters, non-binary asset exclusion (`.sha256`, `.asc`, `.md`), and glibc vs. musl binary ranking (`selectBestMatch`). Go's `pkg/arch/arch.go` provides only `GetOS()`, `GetArch()`, and `DetectLibc()`.
- **Impact**: Complex release asset selection for GitHub/Gitea releases may select suboptimal or non-executable assets (e.g. selecting a `.sha256` checksum file instead of a release archive).
- **Fix**: Port zinit soft/hard pattern matching and asset scoring algorithms to `pkg/arch/arch.go`.

### 13. Missing Remote Catalog Generator in `pkg/features/readme.go`
- **Severity / Category**: Medium / Feature Parity
- **Issue**: TypeScript's `ReadmeService.ts` provided remote GitHub README downloads, `generateCatalogFromConfigs`, `generateCombinedReadme`, and `CATALOG.md` writing. Go's `pkg/features/readme.go` implements only local frontmatter parsing (`ParseReadme`) and local caching.
- **Impact**: Feature catalog generation commands (`dotfiles features`) fail to build combined documentation or download remote tool documentation.
- **Fix**: Port remote README fetching and catalog markdown aggregation to `pkg/features/readme.go`.

### 14. Dashboard Update Check Endpoint Stub (`pkg/dashboard/routes.go`)
- **Severity / Category**: Medium / GUI Parity
- **Issue**: The `/api/tools/:name/check-update` endpoint in `pkg/dashboard/routes.go` returns a hardcoded response (`{"hasUpdate": false}`) rather than executing the tool's installer `CheckUpdate()` engine.
- **Impact**: Clicking "Check for Updates" in the visual dashboard web UI silently reports all tools as up-to-date.
- **Fix**: Wire `/api/tools/:name/check-update` to call `installer.CheckUpdate(ctx, tool)` in `pkg/dashboard/routes.go`.

### 15. Dead Code in `pkg/unwrap` Package
- **Severity / Category**: Low / Code Hygeine & Maintainability
- **Issue**: `pkg/unwrap` was created to port TypeScript's `unwrap-value` package, but `pkg/vm` handles JS value evaluation directly through Goja native bindings. The `pkg/unwrap` package is unused across the entire Go codebase.
- **Impact**: Unused dead code increases maintenance burden and confuses developers.
- **Fix**: Remove `pkg/unwrap` during Wave 10 cleanup (tracked in ticket `2026-06-29-wave-10-cleanup-unused-unwrap-package.md`).

### 16. Socket Timeout Guard in Downloader (`pkg/downloader/downloader.go`)
- **Severity / Category**: Medium / Network Resiliency
- **Issue**: While `NewDownloader()` configures a 30s timeout on default `http.Client` instances, passing custom `http.Client` options without explicit dial or TLS handshake timeouts risks hanging connections on unresponsive network mirrors or proxies.
- **Impact**: Long-running download processes can freeze indefinitely on unresponsive HTTP endpoints.
- **Fix**: Enforce fallback `net.Dialer` and `TLSHandshakeTimeout` settings on all custom HTTP transport configurations in `pkg/downloader/downloader.go`.

