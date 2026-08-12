# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

### Feasibility Check: Can we delete TS and ship Go today without breaking anything?

**NO, NOT YET.** While the vast majority of runtime features, installers, database structures, and CLI commands have been successfully migrated to Go, deleting the remaining TypeScript packages and cutting a release today would introduce **3 critical user-facing breakages** and **4 runtime/security vulnerabilities**:

1. **Broken Config Autocompletion & Type Resolution (DX)**: User-authored `.tool.ts` files rely on published type definitions. The current `.d.ts` build pipeline concatenates extracted TypeScript declarations with overlapping identifiers (`PlatformCallback`, `ArchCallback`, `ShellCallback`), creating duplicate symbol errors during strict TypeScript typechecking. Furthermore, `IFileSystem` interface definitions in `dsl-types.ts` declare methods as returning `Promise<T>`, whereas native Goja VM bindings execute synchronously.
2. **Missing `dotfiles.config.ts` Default Fallback**: The CLI bootstrap logic (`cmd/dotfiles/bootstrap.go:50`) checks for `test-project-npm/dotfiles.config.json` when no `--config` flag is passed, failing to fall back to `dotfiles.config.ts`. Any user running `dotfiles generate` without an explicit `-c` flag will fail to load their configuration.
3. **Broken Platform Serialization in Dashboard**: The REST API endpoint `GET /api/tools` (`pkg/dashboard/routes.go`) serializes platform configurations as raw bitmask integers (`3`) instead of string arrays (`["Linux", "macOS"]`), breaking dashboard frontend UI rendering.
4. **Infinite HTTP Client Timeout Risk**: In `pkg/downloader/downloader.go`, initializing `NewDownloader` without an explicit `http.Client` defaults to `&http.Client{}`. In Go's standard library, the default `http.Client` has **no request timeout** (`Timeout: 0`), leaving CLI downloads vulnerable to hanging indefinitely on un-responding upstream servers.
5. **Subprocess Pipe Hang in Archive Extractor**: In `pkg/archive/archive.go` (`extractTarXz`), an early error during tar extraction (e.g. Zip-Slip rejection or header corruption) fails to close the reader end of the pipe (`pr.Close()`). The background goroutine feeding `xz -d -c` blocks indefinitely on `pw.Write`, leaving zombie `xz` child processes and leaking goroutines.
6. **Non-Deterministic Shell Emissions**: `pkg/orchestrator/orchestrator.go` iterates over environment variables, aliases, and functions using Go's randomized map iteration without sorting keys. Consequently, every execution of `dotfiles generate` produces random line ordering in `main.zsh`, `main.bash`, and `main.ps1`.
7. **Bypassed Sudo Security Validation**: `pkg/installer/installer.go` does not validate whether an installer plugin supports sudo (`SupportsSudo() === true`) before executing elevated commands. If a user sets `sudo: true` on a tool backed by `brew` or `npm`, Go executes `sudo` blindly rather than failing fast with a validation error.

---

### Current Monorepo State

The repository is in a transitional hybrid state on branch `agorbatchev/golang`. Core logic, installers, database storage, downloader, archive extractor, dashboard backend, shell emissions, and CLI commands reside entirely in Go (`pkg/` and `cmd/dotfiles`). Go binaries are compiled and bundled via a native Go build runner (`scripts/build/main.go`). The legacy TypeScript implementation in `packages/` has been largely refactored or deprecated, but TypeScript build scripts (`bun build_dashboard.js`) and type declarations (`packages/dashboard/src/shared/types.gen.ts`) are still invoked during compilation.

---

### Overall Migration Parity Score: **8.8 / 10**

| Domain                            |    Score     | Hard Technical Justification                                                                                                                                                                                        |
| :-------------------------------- | :----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core File System & Database**   | **9.5 / 10** | 100% SQLite schema, connection pooling, WAL mode, transaction enforcement, and permission serialization parity. Minor divergence in `MemFS.Exists` for broken symlinks.                                             |
| **Orchestration & CLI Commands**  | **9.0 / 10** | Complete parity across topological sorter, once-scripts lifecycle, shell integrations, and subcommands. Deducted for randomized map ordering in shell emissions and config fallback bug.                            |
| **Installer Plugins (15/15)**     | **8.5 / 10** | All 15 installers implemented and supporting `Install`, `Uninstall`, and `CheckUpdate`. Deducted for missing sudo pre-execution validation and missing system path fallback in `curl-script`.                       |
| **Networking, Archive & Proxy**   | **8.5 / 10** | HTTP Proxy features 100% parity; archive extractor supports native DMG/PKG extraction and Zip-Slip safety. Deducted for infinite HTTP timeout risk and `tar.xz` pipe leak.                                          |
| **Dashboard, Build & Test Suite** | **8.5 / 10** | Native Go build script cross-compiles binaries with zero Node runtime dependencies; 20/21 E2E tests translated. Deducted for platform bitmask API bug, missing `typeSafety.test.ts`, and `.d.ts` duplicate symbols. |

---

### Current Dual-Run Parity Status (`bun check:ci` Analysis)

`bun check:ci` executes formatting, linting, typechecking, and `bun test:all` (which runs `go test ./...` and `tests/e2e`). The legacy dual-run parity harness (`scripts/parity-harness`) comparing TS CLI stdout directly against Go CLI stdout was removed when TS core packages were deprecated; CI now relies entirely on Go native E2E integration tests in `tests/e2e/`.

---

## 2. DUE DILIGENCE & TECHNICAL AUDIT FINDINGS

The following 8 critical technical findings were identified during holistic code inspection and side-by-side runtime analysis. Each issue details the exact code location, severity, failure mode, and required remediation:

### 1. Un-timeouted Default HTTP Client

- **Location**: `pkg/downloader/downloader.go:34-39`
- **Severity**: **HIGH** (Reliability / Hanging Process Vulnerability)
- **Failure Mode**: `NewDownloader` falls back to `&http.Client{}` when passed a `nil` client parameter. In Go's standard library, `http.Client{}` has `Timeout: 0` (infinite timeout). If `opts[0].Timeout == 0` and `ctx` is `context.Background()`, an un-responding HTTP server during package downloads will cause the Go CLI to block indefinitely without giving control back to the user or timing out.
- **Remediation**: Initialize fallback HTTP client with explicit default timeout: `&http.Client{ Timeout: 30 * time.Second }`.

### 2. Subprocess Pipe Leak & Goroutine Deadlock in Archive Extractor

- **Location**: `pkg/archive/archive.go:240-316` (`extractTarXz`)
- **Severity**: **HIGH** (Resource Leak / Zombie Process Vulnerability)
- **Failure Mode**: In `extractTarXz`, an `io.Pipe()` (`pr`, `pw`) streams stdout from `xz -d -c` into `archive/tar`. On early exit paths in the main thread (e.g. Zip-Slip security path rejection, corrupted tar header, or context cancellation), `pr` is not closed. The background goroutine executing `xz` attempts to write to `pw`, which blocks indefinitely once the pipe buffer fills up. This leaks `xz` child processes and locks background goroutines until process termination.
- **Remediation**: Insert `defer pr.Close()` immediately following `io.Pipe()` creation so that any early return closes the reader end, unblocking `pw.Write()` with `io.ErrClosedPipe`.

### 3. Non-Deterministic Shell Script Emissions

- **Location**: `pkg/orchestrator/orchestrator.go:845-885` (`generateShellScripts`)
- **Severity**: **MEDIUM** (Reproducibility & Git Diff Noise)
- **Failure Mode**: `generateShellScripts` iterates over `stc.Env`, `stc.Aliases`, and `stc.Functions` using native Go `for k, v := range map`. Go map iteration order is randomized by design. Subsequent runs of `dotfiles generate` against identical configuration files produce different line ordering in `main.zsh`, `main.bash`, and `main.ps1`, generating spurious git diffs and breaking output determinism.
- **Remediation**: Extract keys into string slices, sort keys alphabetically with `sort.Strings(keys)`, and iterate over sorted keys.

### 4. CLI Bootstrap Fallback Ignores `dotfiles.config.ts`

- **Location**: `cmd/dotfiles/bootstrap.go:50` (`BootstrapServices`)
- **Severity**: **MEDIUM** (DX & Contract Misalignment)
- **Failure Mode**: `BootstrapServices` checks for `test-project-npm/dotfiles.config.json` when no explicit `--config` flag is supplied. It omits checking for `dotfiles.config.ts`. Any user attempting to run `dotfiles generate` or `dotfiles install` without explicit `-c` flags will fail to locate their TypeScript configuration file.
- **Remediation**: Expand default fallback list to check `dotfiles.config.ts` before returning a config resolution error.

### 5. Bypassed Sudo Elevation Validation

- **Location**: `pkg/installer/installer.go`
- **Severity**: **HIGH** (Security & Policy Enforcement)
- **Failure Mode**: In TypeScript, `runWithSudo` validated `inst.supportsSudo() === true` before running elevated tools. In Go, `pkg/installer/installer.go` does not check `inst.SupportsSudo()`. If a user specifies `sudo: true` on a tool backed by non-sudo installers (e.g. `brew`, `npm`, `cargo`), Go executes `sudo` blindly without pre-execution validation.
- **Remediation**: Check `if tool.Sudo && !inst.SupportsSudo()`, returning `fmt.Errorf("installer %q does not support sudo elevation", inst.Name())`.

### 6. Dashboard Platform Serialization Output Misalignment

- **Location**: `pkg/dashboard/routes.go` (`handleGetTools`)
- **Severity**: **MEDIUM** (Frontend UI Integration Contract)
- **Failure Mode**: The endpoint `GET /api/tools` serializes `config.platformConfigs[].platforms` as an integer bitmask (`3`) instead of string array (`["Linux", "macOS"]`). Dashboard frontend TypeScript interfaces expect string arrays, causing UI rendering failures when displaying tool platform compatibility.
- **Remediation**: Convert bitmask integers into string slices prior to JSON serialization.

### 7. Duplicate Symbol Declarations in Emitted `.d.ts` Bundles

- **Location**: `scripts/build/main.go` (`generateSchemaTypes`)
- **Severity**: **MEDIUM** (Type Boundary & DX)
- **Failure Mode**: `generateSchemaTypes` extracts type declarations from `loader-api.ts` and concatenates them with `dsl-types.ts`. Identifiers such as `PlatformCallback`, `ArchCallback`, `ShellCallback`, `IToolBuilder`, and `IShellConfigs` are defined in both files, causing duplicate symbol declaration errors during TypeScript compilation (`bun typecheck`).
- **Remediation**: Deduplicate declaration blocks during `.d.ts` generation.

### 8. `MemFS.Exists` vs `OSFS.Exists` Divergence on Broken Symlinks

- **Location**: `pkg/fs/mem_fs.go:121-127` vs `pkg/fs/os_fs.go:27-35`
- **Severity**: **LOW** (In-Memory Virtual FS Divergence)
- **Failure Mode**: `OSFS.Exists` uses `os.Stat` (follows symlinks, returning `false` for broken symlinks). `MemFS.Exists` checks map key presence (returning `true` for broken symlinks).
- **Remediation**: Align `MemFS.Exists` with `OSFS.Exists` by evaluating target symlinks in `MemFS.Exists`.

---

## 3. Feasibility Analysis (What Breaks on Demolition)

### 3.1 The `.tool.ts` Authoring Experience (DX) & VM / Typings

- **Typegen Generation (`scripts/typegen/main.go`)**: Converts Go structs in `pkg/config` directly into TypeScript interfaces at `packages/dashboard/src/shared/types.gen.ts`.
- **DSL Typings (`pkg/vm/dsl-types.ts`)**: Defines builder interfaces (`IToolConfigBuilder`, `IShellConfigurator`, `IInstallFunction`, `Platform`, `Architecture`, `IFileSystem`, `IConfigContext`).
- **Loader API (`pkg/vm/loader-api.ts`)**: Binds native Goja JavaScript globals (`defineConfig`, `defineTool`, `Platform`, `Architecture`).
- **Demolition Impact & Gaps**:
  1. **Duplicate Identifier Errors in `.d.ts` Bundle**: `scripts/build/main.go` (`generateSchemaTypes`) extracts type declarations from `loader-api.ts` and concatenates them with `dsl-types.ts`. Identifiers such as `PlatformCallback`, `ArchCallback`, `ShellCallback`, `IToolBuilder`, and `IShellConfigs` are defined in both files, generating duplicate symbol errors in emitted `.d.ts` files.
  2. **Sync vs. Async `IFileSystem` Mismatch**: `dsl-types.ts` specifies `IFileSystem` methods (`readFile`, `writeFile`, `exists`, `mkdir`, `readdir`, `rm`) as returning `Promise<T>`. In `pkg/vm/loader-api.ts`, native Goja bindings execute synchronously and wrap returns in `Promise.resolve()`. User `.tool.ts` scripts expecting standard async promises vs synchronous returns require strict alignment.

### 3.2 The Dashboard Client & Backend Server

- **Asset Embedding (`pkg/dashboard/dashboard.go`)**: Uses Go 1.16+ `//go:embed all:dist` to self-contain Preact/Tailwind client assets compiled by Bun (`bun build_dashboard.js`).
- **REST API Endpoints Audit**:
  - `GET /api/stats`, `GET /api/config`, `GET /api/health`, `GET /api/activity`, `GET /api/recent-tools`, `GET /api/tools/:name`, `GET /api/tools/:name/history`, `GET /api/tools/:name/readme`, `GET /api/tools/:name/source`, `GET /api/tool-configs-tree`, `GET /api/shell`: **100% Parity Achieved**.
  - `GET /api/tools`: **Contract Bug**. `config.platformConfigs[].platforms` returns raw bitmask integer (`3`) instead of string array (`["Linux", "macOS"]`).
  - `POST /api/tools/:name/check-update`: **Stubbed Response**. Returns static boolean `{ hasUpdate: false, currentVersion: "latest", latestVersion: "latest", supported: true }`.

### 3.3 The Build & NPM Packaging Pipeline

- **Native Build Script (`scripts/build/main.go`)**:
  - Compiles Preact dashboard assets via Bun.
  - Runs Go typegen to produce `types.gen.ts`.
  - Generates `.dist/schemas.d.ts`, `.dist/authoring-types.d.ts`, `.dist/cli.d.ts`, `.dist/tool-types.d.ts`.
  - Generates root `.dist/package.json` and 4 target platform descriptors (`@alexgorbatchev/dotfiles-darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`).
  - Emits launcher script `.dist/cli.js` (uses `node:child_process` `spawnSync` to run native binary with zero npm dependencies).
  - Cross-compiles statically linked Go binaries (`CGO_ENABLED=0 -ldflags="-s -w"`).
- **Demolition Impact & Gaps**:
  1. **Binary Size Limit Enforcement Missing**: `packages/build` enforced a 26MB binary budget (`enforceGoBinarySizeLimit.ts`). `scripts/build/main.go` does not check binary sizes.
  2. **Type Assertion Validation (`tsd`) Missing**: `packages/build` executed `tsd` against generated `.d.ts` files to guarantee type safety. `scripts/build/main.go` lacks `tsd` type testing.

---

## 4. Structural & Architectural Gaps

### 4.1 Method-by-Method Comparison Matrix (Go vs. TypeScript Predecessors)

| Component        | TypeScript Predecessor (`main`)     | Go Implementation (`pkg/`)                        | Status & Parity Notes                                                              |
| :--------------- | :---------------------------------- | :------------------------------------------------ | :--------------------------------------------------------------------------------- |
| **File System**  | `PhysicalFileSystem.readFile`       | `OSFS.ReadFile(path)` (`pkg/fs/os_fs.go`)         | **100% Parity**: Reads raw bytes from disk.                                        |
| **File System**  | `PhysicalFileSystem.writeFile`      | `OSFS.WriteFile(path, data, perm)`                | **100% Parity**: Writes bytes with Unix permissions.                               |
| **File System**  | `PhysicalFileSystem.exists`         | `OSFS.Exists(path)`                               | **100% Parity**: Uses `os.Stat` (returns `false` on broken symlinks).              |
| **File System**  | `MemoryFileSystem.exists`           | `MemFS.Exists(path)` (`pkg/fs/mem_fs.go`)         | **Divergence**: Checks map key existence; returns `true` on broken symlinks.       |
| **File System**  | `TrackedFileSystem.ts`              | `TrackedFS` (`pkg/fs/tracked_fs.go`)              | **100% Parity**: Intercepts mutators and records ops in `registry.Registry`.       |
| **File System**  | `ResolvedFileSystem.ts`             | `ResolvedFS` (`pkg/fs/resolved_fs.go`)            | **100% Parity**: Expands `~` and `~/` home directory paths.                        |
| **Database**     | `RegistryDatabase.ts`               | `db.NewConnection` (`pkg/db/db.go`)               | **100% Parity**: SQLite WAL mode, busy timeout 5000ms, connection pooling.         |
| **Registry**     | `FileRegistry.recordOperation`      | `Registry.RecordFileOperation` (`pkg/registry`)   | **Enforced Safety**: Go strictly mandates non-nil `*sql.Tx`.                       |
| **Registry**     | Permissions handling                | `Permission("0644")` (`pkg/registry`)             | **100% Wire Parity**: Octal string `"0644"` stored as decimal `"420"` in SQLite.   |
| **Orchestrator** | `GeneratorOrchestrator.generateAll` | `Orchestrator.GenerateTools` (`pkg/orchestrator`) | **100% Parity**: Topological sorting, staging, shims, symlinks, completions.       |
| **Orchestrator** | `orderToolConfigsByDependencies`    | `orchestrator.TopologicalSort`                    | **100% Parity**: Kahn's algorithm preserving initial array index order.            |
| **Shell Init**   | `ShellInitGenerator.generate`       | `Orchestrator.generateShellScripts`               | **Divergence**: Go map iteration order is randomized. Needs key sorting.           |
| **Shims**        | `ShimGenerator.generateShim`        | `shim.Generator.Generate` (`pkg/shim`)            | **100% Parity**: Uses embedded `shim.tmpl` with recursion guard and auto-update.   |
| **Virtual Env**  | `VirtualEnvGenerator.create`        | `venv.Manager.Create` (`pkg/venv`)                | **100% Parity**: Generates `source`, `source.ps1`, `dotfiles.config.ts`, `tools/`. |
| **Downloader**   | `Downloader.downloadToFile`         | `Downloader.Download` (`pkg/downloader`)          | **Go Superiority**: Adds Range header resumption (206 Partial Content).            |
| **Downloader**   | `http.Client` default               | `NewDownloader` (`pkg/downloader`)                | **Vulnerability**: Nil client defaults to `Timeout: 0` (no timeout).               |
| **Archive**      | `extractArchiveByFormat('zip')`     | `Extractor.extractZip` (`pkg/archive`)            | **Go Superiority**: Native Zip-Slip security and symlink escape checks.            |
| **Archive**      | `extractArchiveByFormat('tar.xz')`  | `Extractor.extractTarXz` (`pkg/archive`)          | **Bug**: Early error leaks `pr.Close()`, blocking `xz` background goroutine.       |
| **Archive**      | DMG & PKG extraction                | `extractDmg` & `extractPkg` (`pkg/archive`)       | **Go Superiority**: macOS `hdiutil attach` and `pkgutil --expand-full`.            |
| **HTTP Proxy**   | `createProxyServer.ts`              | `Server` (`pkg/proxy/proxy.go`)                   | **100% Parity**: `/cache/clear`, `/cache/stats`, `/cache/populate`, `/` proxying.  |
| **Utils**        | `expandHomePath`                    | `utils.ExpandHomePath` (`pkg/utils`)              | **100% Parity**: Expands `~`, `~/`, and `~\`.                                      |

---

## 5. Installer & Package Manager Gaps

### 5.1 15/15 Installer Plugins Parity Summary

All 15 installer plugins (`apt`, `brew`, `cargo`, `curl-binary`, `curl-script`, `curl-tar`, `dmg`, `dnf`, `gitea`, `github`, `manual`, `npm`, `pacman`, `pkg`, `zsh-plugin`) have been migrated to Go (`pkg/installer/`). In Go, every plugin implements `Install`, `Uninstall`, and `CheckUpdate`.

### 5.2 Sudo Elevation Security & Validation Gap

- **`SupportsSudo()` Declarations**:
  - `true` (5 installers): `apt`, `dnf`, `pacman`, `pkg`, `manual`.
  - `false` (10 installers): `brew`, `cargo`, `curl-binary`, `curl-script`, `curl-tar`, `dmg`, `gitea`, `github-release`, `npm`, `zsh-plugin`.
- **Validation Discrepancy**:
  In TypeScript, `runWithSudo` validated that the installer plugin returns `supportsSudo() === true`. If a tool requests `sudo: true` for a plugin that returns `supportsSudo() === false` (e.g. `brew` or `npm`), TS rejects execution with an error. In Go, `pkg/installer/installer.go` does not enforce pre-execution validation of `tool.Sudo` against `inst.SupportsSudo()`.

### 5.3 Plugin-Specific Behavioral Gaps

1. **Curl Script (`curl-script`) System Path Fallback**: TypeScript `installFromCurlScript.ts` checks if an installer script placed binaries outside `stagingDir` (e.g. `/usr/local/bin`, `~/.local/bin`) and copies found binaries into `stagingDir`. Go `pkg/installer/curl_script.go` does not perform system fallback copying.
2. **GitHub Release (`github-release`) Enterprise Integration**: TypeScript `GitHubReleaseInstallerPlugin` supports `ghCli: true` using `GhCliApiClient` for GitHub Enterprise and authenticated environments. Go `pkg/installer/github.go` only supports direct HTTP API queries.

---

## 6. Test Coverage Gaps (TS vs. Go E2E)

### 6.1 E2E Test Suite Comparison Matrix

| TypeScript Test File (`packages/e2e-test/src/__tests__/*`) | Go E2E Test File (`tests/e2e/*`) | Parity Status & Notes                                                       |
| :--------------------------------------------------------- | :------------------------------- | :-------------------------------------------------------------------------- |
| `apt.test.ts`                                              | `apt_test.go`                    | **Parity Achieved**: Apt installer package tracking and shims.              |
| `autoInstall.test.ts`                                      | `auto_install_test.go`           | **Parity Achieved**: Auto-installation logic on missing binaries.           |
| `completion.test.ts`                                       | `completion_test.go`             | **Parity Achieved**: Shell completion script generation.                    |
| `conflict.test.ts`                                         | `conflict_test.go`               | **Parity Achieved**: Conflict detection on duplicate binary names.          |
| `dependency.test.ts`                                       | `dependency_test.go`             | **Parity Achieved**: Topological dependency order and cycle checks.         |
| `dnf.test.ts`                                              | `dnf_test.go`                    | **Parity Achieved**: Dnf installer mock execution.                          |
| `env.test.ts`                                              | `env_test.go`                    | **Parity Achieved**: Environment variable export generation.                |
| `files.test.ts`                                            | `files_test.go`                  | **Parity Achieved**: File tracking in SQLite registry.                      |
| `generate.test.ts`                                         | `generate_test.go`               | **Parity Achieved**: `generate` subcommand output.                          |
| `ghCli.test.ts`                                            | `gh_cli_test.go`                 | **Parity Achieved**: GitHub CLI download fallbacks.                         |
| `giteaRelease.test.ts`                                     | `gitea_release_test.go`          | **Parity Achieved**: Gitea release asset downloads.                         |
| `hook.test.ts`                                             | `hook_test.go`                   | **Parity Achieved**: Tool installation hooks.                               |
| `install.test.ts`                                          | `install_test.go`                | **Parity Achieved**: Full installation pipeline.                            |
| `pacman.test.ts`                                           | `pacman_test.go`                 | **Parity Achieved**: Pacman installer mock execution.                       |
| `pkg.test.ts`                                              | `pkg_test.go`                    | **Parity Achieved**: macOS `.pkg` installer handling.                       |
| `symlinkStale.test.ts`                                     | `symlink_stale_test.go`          | **Parity Achieved**: Stale symlink cleanup.                                 |
| `toolRename.test.ts`                                       | `tool_rename_test.go`            | **Parity Achieved**: Tool rename migration handling.                        |
| `trace.test.ts`                                            | `trace_test.go`                  | **Parity Achieved**: `--trace` logging outputs.                             |
| `typeSafety.test.ts`                                       | **MISSING IN GO**                | **Critical Gap**: Checks compile-time DSL type safety (`@ts-expect-error`). |
| `update.test.ts`                                           | `update_test.go`                 | **Parity Achieved**: Version update detection.                              |
| `versionDetection.test.ts`                                 | `version_detection_test.go`      | **Parity Achieved**: Version binary regex detection.                        |
| _N/A_                                                      | `dry_run_sandboxing_test.go`     | **Added in Go**: Verifies virtual filesystem isolation during dry runs.     |

---

### 6.2 Risk Analysis of TypeScript Demolition

20 out of 21 E2E integration test files have been natively translated to Go in `tests/e2e/`. The sole missing test file is `typeSafety.test.ts`.

**Risk of Demolition**: If TypeScript packages are removed without adding a `tsd` step or type assertion test in `scripts/build/main.go`, changes to `pkg/vm/dsl-types.ts` or `scripts/typegen/main.go` could silently release broken TypeScript declarations (`.d.ts`) to end users without failing CI.

---

## 7. Completed vs. Remaining Backlog

### 7.1 Summary of Completed Waves (Waves 1–5)

- **Wave 1–2**: Core SQLite database schema, registry tracking, permission conversion, and virtual filesystem abstractions (`OSFS`, `MemFS`, `TrackedFS`, `ResolvedFS`).
- **Wave 3**: All 15 installer plugins, platform configuration resolvers, and installer registry.
- **Wave 4**: Downloader with Range header resumption, archive extractor with native Zip-Slip protection, HTTP proxy server, and process execution runner.
- **Wave 5**: Orchestrator, topological sorter, shell script generator (`main.zsh`, `main.bash`, `main.ps1`), shim generator, virtual env manager, embedded dashboard server, and all CLI subcommands.

---

### 7.2 Active Wave 6 & Wave 10 Tickets (Path to Pure Go Distribution)

To safely demolish TypeScript and transition to a 100% pure statically-linked Go binary distribution, the following sequential roadmap must be executed:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WAVE 6 / WAVE 10 REMEDIATION ROADMAP               │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
  1. FIX CRITICAL RUNTIME BUGS       │
     ├── Ticket 6.1: Set 30s default timeout in pkg/downloader/downloader.go
     ├── Ticket 6.2: Add defer pr.Close() in pkg/archive/archive.go (tar.xz)
     ├── Ticket 6.3: Sort map keys in pkg/orchestrator/orchestrator.go
     └── Ticket 6.4: Add dotfiles.config.ts fallback in cmd/dotfiles/bootstrap.go
                                     │
  2. FIX SECURITY & API CONTRACTS    │
     ├── Ticket 6.5: Enforce SupportsSudo() check in pkg/installer/installer.go
     └── Ticket 6.6: Format platform bitmask as string array in pkg/dashboard/routes.go
                                     │
  3. BUILD & TYPE BOUNDARY HARDENING │
     ├── Ticket 6.7: Deduplicate exported symbols in scripts/build/main.go (.d.ts)
     ├── Ticket 6.8: Align IFileSystem sync/async signatures in dsl-types.ts
     ├── Ticket 6.9: Add tsd type assertion testing step in scripts/build/main.go
     └── Ticket 6.10: Re-enable 26MB binary size limit check in scripts/build/main.go
                                     │
  4. FINAL TS DEMOLITION & RELEASE   │
     ├── Ticket 10.1: Remove legacy packages/ TS sources
     └── Ticket 10.2: Cut pure Go binary release vX.Y.Z
```

#### Detailed Ticket Breakdown

- **Ticket 6.1: Default Downloader HTTP Timeout**
  - _Location_: `pkg/downloader/downloader.go:34-39`
  - _Action_: When `client == nil`, initialize `http.Client` with `Timeout: 30 * time.Second` instead of un-timeouted default.

- **Ticket 6.2: Subprocess Pipe Cleanup in Archive Extractor**
  - _Location_: `pkg/archive/archive.go:240-316`
  - _Action_: Call `defer pr.Close()` immediately after `io.Pipe()` creation in `extractTarXz` to prevent background goroutine blocks on early errors.

- **Ticket 6.3: Deterministic Shell Emission Ordering**
  - _Location_: `pkg/orchestrator/orchestrator.go:845-885`
  - _Action_: Collect map keys for `stc.Env`, `stc.Aliases`, and `stc.Functions`, sort them alphabetically with `sort.Strings()`, and iterate over sorted keys.

- **Ticket 6.4: Default Config File Path Resolution**
  - _Location_: `cmd/dotfiles/bootstrap.go:50`
  - _Action_: Update default config detection order to check `dotfiles.config.ts` before failing.

- **Ticket 6.5: Installer Sudo Elevation Validation**
  - _Location_: `pkg/installer/installer.go`
  - _Action_: Check `if tool.Sudo && !inst.SupportsSudo()`, return `fmt.Errorf("installer %q does not support sudo elevation", inst.Name())`.

- **Ticket 6.6: Dashboard Platform Array Serialization**
  - _Location_: `pkg/dashboard/routes.go` (`handleGetTools`)
  - _Action_: Convert platform bitmask integers into string slices (e.g. `[]string{"Linux", "macOS"}`) before JSON serialization.

- **Ticket 6.7: Deduplicate Emitted TypeScript Declarations**
  - _Location_: `scripts/build/main.go` (`generateSchemaTypes`)
  - _Action_: Strip duplicate type declarations when combining `loader-api.ts` and `dsl-types.ts` into `.dist/schemas.d.ts`.

- **Ticket 6.8: Align `IFileSystem` DSL Types**
  - _Location_: `pkg/vm/dsl-types.ts` & `pkg/vm/loader-api.ts`
  - _Action_: Align method return types and document sync execution semantics in Goja runtime.

- **Ticket 6.9: Integrate `tsd` Type Testing in Build Pipeline**
  - _Location_: `scripts/build/main.go`
  - _Action_: Add execution of `tsd` against emitted `.dist/*.d.ts` definitions in the build pipeline.

- **Ticket 6.10: Re-enable Binary Size Limit Enforcement**
  - _Location_: `scripts/build/main.go`
  - _Action_: Check compiled binary size against 26MB budget and fail build if exceeded.

- **Ticket 10.1 & 10.2: Legacy Package Demolition & Release**
  - _Action_: Delete unused TS legacy source directories, run full `bun check:ci`, compile release binaries, and publish.
