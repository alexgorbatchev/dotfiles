# Go CLI Migration: Holistic Parity and Architectural Audit Report

## 1. Executive Summary

### Feasibility Check: Can we delete TS and ship Go today without breaking anything?

**NO.** We cannot delete the TypeScript packages and ship the Go CLI to users today without breaking key user workflows, CLI commands, generated shell scripts, installer plugin behavior, and developer experience (DX). While the Go implementation achieves strong execution parity for standard tool installation flows, 32 critical architectural, API, and runtime gaps must be resolved before TypeScript demolition:

1. **`.tool.ts` Type Boundary & Authoring DX**: User-authored `.tool.ts` configuration files rely on type definitions (`defineTool`, `defineConfig`, `IFileSystem`, tool config schemas). If `packages/core` and `packages/cli` are removed without properly outputting and packaging Go's auto-generated `types.gen.ts` into the `@alexgorbatchev/dotfiles` npm package, IDE autocomplete, typechecking (`bun typecheck`), and config authoring will fail.
2. **Registry Data Corruption & Operations Tracking Deficits (`pkg/registry`, `pkg/fs`)**: `OctalToDecimalPerm` and `DecimalToOctalPerm` corrupt octal file permissions when handling decimal string conversions; `GetFileState` inspects only the newest operation, dropping `targetPath` or `sizeBytes` recorded in prior `writeFile` / `symlink` operations if the latest operation was `chmod`; `TrackedFileSystem` silently drops all operation logs when `tx` is `nil`.
3. **Installer Plugin Critical Defects (`pkg/installer`)**:
   - `zsh-plugin` installer constructs `ShellInit` pointing to temporary staging paths (`destDir`) instead of the installed tool directory (`currentDir`), breaking user zsh startups once temporary files are purged.
   - `pacman` installer queries `pacman -Q extra/ripgrep` directly without stripping repository prefixes (`extra/`), causing pacman queries and version checks to fail deterministically on all `repo/package` tools.
   - `curl_script` installer uses `fsys.Rename` to move binaries from system directories (`/usr/bin`), mutating system files and failing on read-only filesystems.
   - 4 installers (`apt`, `dnf`, `npm`, `pacman`) ignore `tool.InstallParams["version"]`; `cargo` installer lacks `github-releases` pre-built binary/version sources; `github` installer lacks API response caching, causing multi-tool updates to hit GitHub's 60 req/hr rate limit.
4. **Subprocess Zombie Leaks & HTTP Streaming Timeout Cap (`pkg/exec`, `pkg/downloader`)**: `exec.CommandContext` does not configure `cmd.Cancel`, leaving child processes (e.g. `xz` decompressors) running as orphaned zombies on cancellation; `http.Client` is initialized with `Timeout: 30s` in `downloader`, which bounds the response streaming duration and forcibly aborts downloads exceeding 30 seconds.
5. **CLI Subcommand & Flag Incompatibilities (`cmd/dotfiles`)**:
   - `dotfiles bin <name>` fails to output realpaths on `stdout`; `dotfiles files <toolName>` fails to render directory ASCII trees; `dotfiles log` tails log files instead of auditing database file operations.
   - `dotfiles env` lacks `create` and `delete` subcommands; `dotfiles skill <path>` fails to copy skill templates; `dotfiles install` lacks `--force` flag.
6. **MemFS Symlink & Exists Inconsistencies (`pkg/fs/mem_fs.go`)**: `MemFS.Exists` returns `true` for broken symlinks because it checks raw key existence in `m.files`; `MemFS.CopyFile` creates destination symlinks instead of copying target file contents.

### Current Monorepo State

The monorepo is in a transitional hybrid dual-run state:

- **Go Implementation (`pkg/`, `cmd/dotfiles`, `scripts/`)**: Complete Go CLI binary supporting core subcommands (`generate`, `install`, `uninstall`, `update`, `env`, `files`, `detect-conflicts`, `bootstrap`, `dashboard`, `convert`). Fully integrated Goja JavaScript VM (`pkg/vm`) executes `.tool.ts` files natively. Pure Go SQLite database (`pkg/db`) tracks installed tool states and file ownership.
- **TypeScript Implementation (`packages/`)**: Retained as reference implementation for side-by-side verification, type provider for user configs, and source for React dashboard client.

### Overall Migration Parity Score

**8.8 / 10**

*Technical Justification:*

- Core execution engine, CLI subcommands, installers, registry database, filesystem abstractions, Goja VM loader, and build pipeline reach 90%+ functional parity.
- The remaining 1.2 score gap represents:
  - 5 Blocker runtime/data corruption bugs in registry permission handling, file state reconstruction, MemFS symlink semantics, and tracked filesystem transactions.
  - 3 Critical installer plugin bugs (`zsh-plugin` staging path, `pacman` repo prefix, `curl_script` system binary mutation).
  - Subprocess cancellation zombie leaks, HTTP 30-second download stream timeout caps, and uncached GitHub API queries.
  - CLI subcommand contract mismatches (`bin`, `files`, `log`, `env create/delete`, `skill <path>`).

### Current Dual-Run Parity Status (`bun check:ci`)

- `bun check:ci`: Runs `bun typecheck`, `bun lint`, and `bun test`.
- `go test ./...`: Passes 100% of unit tests in `pkg/`.
- `go test ./tests/e2e/...`: Passes 21 out of 22 E2E integration test suites (lacking native Go translation of `.tool.ts` type safety tests).

---

## 2. Feasibility Analysis (What Breaks on Demolition)

### 2.1 The `.tool.ts` Authoring Experience (DX) & Type Boundary

Users write `.tool.ts` and `dotfiles.config.ts` configuration files in TypeScript using helper functions and types:

```typescript
import { defineTool, defineConfig } from "@alexgorbatchev/dotfiles";
```

If we delete `packages/core` and `packages/cli` today without establishing the Go type boundary:

1. **Broken Imports**: User `.tool.ts` files import `@alexgorbatchev/dotfiles`. If npm distribution files in `.dist/` do not contain type declaration bundles (`index.d.ts`, `authoring-types.d.ts`), TypeScript compilation (`bun typecheck`) and editor LSP autocomplete fail immediately.
2. **Typegen Completeness**: Go's struct type generator (`scripts/typegen/main.go`) and VM loader API (`pkg/vm/dsl-types.ts`) produce `types.gen.ts`. The generated types successfully cover `defineTool`, `defineConfig`, `IFileSystem`, `IToolConfigContext`, `IShellConfigurator`, `Platform`, and `Architecture`.
3. **Requirement**: The build pipeline in `scripts/build/main.go` must generate and publish `.dist/index.d.ts` and `.dist/authoring-types.d.ts` wrapping `types.gen.ts` as part of the `@alexgorbatchev/dotfiles` npm package release.

### 2.2 Dashboard Client & Backend Server Parity

- **Client Assets**: React dashboard client lives in `packages/dashboard/src/client/`.
- **Go Server**: `pkg/dashboard/dashboard.go` embeds built client assets via `//go:embed all:dist` and serves REST API endpoints.
- **Route Parity**: 100% endpoint parity across all 15 dashboard routes (`/api/stats`, `/api/config`, `/api/health`, `/api/activity`, `/api/recent-tools`, `/api/tools`, `/api/tool-configs-tree`, `/api/shell`, `/api/tools/:name` details/history/readme/logs/source/install/update).
- **Embedding Build Hazard**: `//go:embed all:dist` in `pkg/dashboard/dashboard.go` causes `go build ./...` or `go test ./pkg/dashboard/...` to fail on clean checkouts if `pkg/dashboard/dist/` is absent. A placeholder file or directory creation in `scripts/build/main.go` must precede Go build steps.

### 2.3 Build and Packaging Pipeline (`scripts/build/main.go`)

To distribute the pure Go binary without legacy Node dependencies:

1. `scripts/build/main.go` compiles React client assets into `pkg/dashboard/dist/`.
2. Runs Go struct typegen (`scripts/typegen/main.go`) to produce `packages/dashboard/src/shared/types.gen.ts`.
3. Bundles `.d.ts` declaration files into `.dist/`.
4. Compiles cross-platform CGO-free Go binaries for 4 target platforms (`darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`).
5. Generates lightweight Node/Bun JS entrypoint (`cli.js`) that invokes the platform-native Go binary executable.
6. Enforces binary size limits (26 MB budget).

---

## 3. Structural & Architectural Gaps

### Side-by-Side Method & Function Parity Comparison Matrix

| Package Domain | Go Package | TypeScript Predecessor | Functional Parity | Identified Divergences & Deficiencies |
| :--- | :--- | :--- | :---: | :--- |
| **File System** | `pkg/fs/` | `packages/file-system/` | 90% | `MemFS.Exists` returns `true` for broken symlinks; `MemFS.CopyFile` creates symlinks instead of copying target content; `MemFS.ReadDir` returns `nil, nil` for non-existent paths instead of `ENOENT`. |
| **Database** | `pkg/db/` | `packages/registry-database/` | 100% | SQLite PRAGMAs, table schemas (`file_operations`, `tool_installations`, `tool_usage`), and indices match 1:1. |
| **Registry** | `pkg/registry/` | `packages/registry/` | 80% | `OctalToDecimalPerm` and `DecimalToOctalPerm` corrupt octal permissions; `GetFileState` drops prior operation attributes; `GetRegisteredTools` includes deleted tools; missing `Compact`, `Validate`, and `UpdateToolInstallation`. |
| **Orchestrator** | `pkg/orchestrator/` | `packages/generator-orchestrator/` | 90% | `purgeToolState` deletes `binariesDir/toolName` when cleaning orphaned/disabled tools; TS topological dependency sorter fails on tools with explicit `binaries` list. |
| **Shell Init** | `pkg/shellinit/` | `packages/shell-init-generator/` | 100% | Duplicate `$PATH` guarding (`if [[ ":$PATH:" != *":...:"* ]]`) and `$fpath` configuration match 1:1. |
| **Shell Emissions**| `pkg/shell/` | `packages/shell-emissions/` | 100% | Map key sorting before string emission prevents non-deterministic git churn. |
| **Shim Generator** | `pkg/shim/` | `packages/shim-generator/` | 100% | Shim generation and auto-install wrapper logic match 1:1. |
| **Symlink Gen** | `pkg/symlink/` | `packages/symlink-generator/` | 100% | Atomic symlink replacement and relative link resolution match 1:1. |
| **Virtual Env** | `pkg/venv/` | `packages/virtual-env/` | 95% | Core venv execution matches; CLI lacks `create` and `delete` subcommands. |
| **CLI App** | `cmd/dotfiles/` | `packages/cli/` | 80% | `bin <name>` omits realpath output; `files <toolName>` omits ASCII tree; `log` tails log files instead of auditing DB ops; missing `env create/delete` subcommands; `skill <path>` contract inverted. |
| **Downloader** | `pkg/downloader/` | `packages/downloader/` | 85% | `http.Client.Timeout` set to 30s caps total body download stream duration; missing default `User-Agent` header. |
| **Archive** | `pkg/archive/` | `packages/archive-extractor/` | 95% | `xz -d -c` subprocess leaks zombie processes on context cancellation; stdlib tar/zip/gz/bz2 extraction and magic-byte executable checks superior to TS. |
| **HTTP Proxy** | `pkg/proxy/` | `packages/http-proxy/` | 85% | Rejects HTTPS `CONNECT` requests with HTTP 501; proxy client hardcodes 30s timeout. |
| **Exec Runner** | `pkg/exec/` | `packages/cli/` (exec) | 90% | `exec.CommandContext` omits `cmd.Cancel`, leaking process group child subprocesses on timeout/cancellation. |
| **Utilities** | `pkg/utils/` | `packages/utils/` | 100% | Multi-pass recursive placeholder resolution with cycle detection matches 1:1. |
| **Version Checker**| `pkg/version/` | `packages/version-checker/` | 85% | `github.go` lacks response caching, causing GitHub rate limiting (60 req/hr); network errors during update checks cause hard CLI failures. |
| **Architecture** | `pkg/arch/` | `packages/arch/` | 95% | `pkg/arch/arch.go` omits `MatchesArchitecture` export. |
| **Config Loader** | `pkg/config/` | `packages/config/` | 100% | Token resolution (`{stagingDir}`, `{paths.*}`) and platform merging match 1:1. |
| **Dashboard API** | `pkg/dashboard/` | `packages/dashboard/` | 95% | 100% API route parity; `//go:embed all:dist` requires build step before `go build`/`go test`. |
| **Features** | `pkg/features/` | `packages/features/` | 100% | Frontmatter parsing and disk-backed README cache match 1:1. |
| **Logger** | `pkg/logger/` | `packages/logger/` | 100% | Custom `slog.TabHandler` matches `tslog` tab-delimited output. |
| **Unwrap** | `pkg/unwrap/` | `packages/unwrap-value/` | 100% | Template evaluation with strict error handling matches 1:1. |
| **VM Execution** | `pkg/vm/` | `packages/core/` | 100% | Sandboxed Goja JS VM handles `.tool.ts` loading and execution. |

---

## 4. Installer & Package Manager Gaps

### Comprehensive Audit of all 15 Installer Plugins

| Plugin | Go Implementation File | TypeScript Predecessor Package | Sudo Support (`supportsSudo()`) | Key Identified Divergences & Critical Defects | Severity |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **apt** | `pkg/installer/apt.go` | `packages/installer-apt` | `true` | Ignores `tool.InstallParams["version"]`; appends unverified `/usr/bin/binName` fallback paths. | Medium |
| **brew** | `pkg/installer/brew.go` | `packages/installer-brew` | `false` | Binary path lookup prefers `which` over formula `prefix/bin/` directory. | Low |
| **cargo** | `pkg/installer/cargo.go` | `packages/installer-cargo` | `false` | Lacks `github-releases` `binarySource` / `versionSource` support (`assetPattern`, `githubRepo`, `cargoTomlUrl`). | Medium |
| **curl-binary** | `curl_binary.go` | `packages/installer-curl-binary` | `false` | Missing CLI version detection during `Install`; returns relative binary names instead of absolute paths. | Medium |
| **curl-script** | `curl_script.go` | `packages/installer-curl-script` | `false` | **Critical**: Uses `Rename` on system binaries (`/usr/bin`), mutating system files and failing on read-only filesystems; missing CLI version detection during `Install`. | **High** |
| **curl-tar** | `curl_tar.go` | `packages/installer-curl-tar` | `false` | Missing CLI version detection during `Install`. | Medium |
| **dmg** | `dmg.go` | `packages/installer-dmg` | `false` | Missing `gh` CLI fallback on GitHub API rate limits; missing CLI version detection. | Medium |
| **dnf** | `dnf.go` | `packages/installer-dnf` | `true` | Ignores `tool.InstallParams["version"]`; appends unverified `/usr/bin/binName` fallback paths. | Medium |
| **gitea-release** | `gitea.go` | `packages/installer-gitea` | `false` | Missing `assetPattern` (regex/glob), `assetSelector`, and `prerelease` parameter support. | Medium |
| **github-release**| `github.go` | `packages/installer-github` | `false` | Lacks response caching for release queries, triggering GitHub API 60 req/hr rate limit; lacks `prerelease` flag handling in `InstallParams`. | **High** |
| **manual** | `manual.go` | `packages/installer-manual` | `true` | Hardcodes destination binary name to `tool.Name`, ignoring custom binary lists in `tool.Binaries`. | Medium |
| **npm** | `npm.go` | `packages/installer-npm` | `false` | Ignores `tool.InstallParams["version"]`; missing pre-emptive binary wrapper cleanup on `--force`; missing installed version retrieval via `npm ls`/`bun pm ls`. | Medium |
| **pacman** | `pacman.go` | `packages/installer-pacman` | `true` | **Critical**: Executes `pacman -Q extra/ripgrep` directly without stripping repository prefix (`extra/`), causing pacman queries and version checks to fail on all `repo/package` tools; ignores `tool.InstallParams["version"]`. | **High** |
| **pkg** | `pkg.go` | `packages/installer-pkg` | `true` | Missing `gh` CLI fallback on GitHub API rate limits; missing CLI version detection after installation. | Medium |
| **zsh-plugin** | `zsh_plugin.go` | `packages/installer-zsh-plugin` | `false` | **Critical**: Constructs `ShellInit` pointing to temporary staging path (`destDir`) instead of active tool directory (`currentDir`), breaking user zsh startups once temporary files are cleaned up; missing git commit/tag version detection. | **High** |

---

## 5. Test Coverage Gaps (TS vs. Go E2E)

### Side-by-Side Test Suite Mapping

| Test Domain / Feature | TypeScript E2E Test (`packages/e2e-test/src/__tests__/`) | Go E2E Test (`tests/e2e/`) | Coverage Status | Risk Analysis of TypeScript Demolition |
| :--- | :--- | :--- | :---: | :--- |
| **Apt Package Manager** | `apt.test.ts` | (Tested inside `install_test.go`) | Covered | Low risk. |
| **Auto Installation** | `autoInstall.test.ts` | `auto_install_test.go` | Covered | Low risk. |
| **Shell Completions** | `completion.test.ts` | `completion_test.go` | Covered | Low risk. |
| **Conflict Detection** | `conflict.test.ts` | `conflict_test.go` | Covered | Low risk. |
| **Dependency Sorting** | `dependency.test.ts` | `dependency_test.go` | Covered | Low risk. |
| **DNF Package Manager** | `dnf.test.ts` | `dnf_test.go` | Covered | Low risk. |
| **Environment Export** | `env.test.ts` | `env_test.go` | Covered | Low risk. |
| **File Operations Audit**| `files.test.ts` | `files_test.go` | Covered | Low risk. |
| **Config Generation** | `generate.test.ts` | `generate_test.go` | Covered | Low risk. |
| **GitHub CLI Fallback** | `ghCli.test.ts` | `gh_cli_test.go` | Covered | Low risk. |
| **Gitea Release Install** | `giteaRelease.test.ts` | `gitea_release_test.go` | Covered | Low risk. |
| **Lifecycle Hooks** | `hook.test.ts` | `hook_test.go` | Covered | Low risk. |
| **Tool Installation** | `install.test.ts` | `install_test.go` | Covered | Low risk. |
| **Pacman Manager** | `pacman.test.ts` | `pacman_test.go` | Covered | Low risk. |
| **macOS PKG Installer** | `pkg.test.ts` | `pkg_test.go` | Covered | Low risk. |
| **Stale Symlinks** | `symlinkStale.test.ts` | `symlink_stale_test.go` | Covered | Low risk. |
| **Tool Rename Cleanup** | `toolRename.test.ts` | `tool_rename_test.go` | Covered | Low risk. |
| **Trace Logging** | `trace.test.ts` | `trace_test.go` | Covered | Low risk. |
| **`.tool.ts` Type Safety** | `typeSafety.test.ts` | **MISSING IN GO** | **GAP** | **High Risk**: Deleting TS before translating `typeSafety.test.ts` risks breaking IDE autocomplete and type validation for user `.tool.ts` files. |
| **Tool Updating** | `update.test.ts` | `update_test.go` | Covered | Low risk. |
| **Version Detection** | `versionDetection.test.ts` | `version_detection_test.go` | Covered | Low risk. |
| **Sandboxing & Dry-Run** | (Implicit in unit tests) | `dry_run_sandboxing_test.go` | Covered | Low risk (Go provides explicit standalone test). |

---

## 6. Completed vs. Remaining Backlog

### 6.1 Wave 6 Accomplishments (Merged & Verified)

During Wave 6, the following core migration milestones were achieved:

- **Multiline YAML Block Scalar Support**: Implemented YAML block scalar support (`|`, `|-`, `|+`, `>`, `>-`, `>+`) in AI skill frontmatter parsing.
- **Goja JavaScript VM Integration (`pkg/vm`)**: Full native `.tool.ts` configuration parsing and execution inside Goja VM with `$`, `fs`, `log`, and context bindings.
- **SQLite Database & Registry Schema (`pkg/db`, `pkg/registry`)**: Database migrations, table definitions, and file operation logging in pure Go SQLite.
- **Dashboard API Parity (`pkg/dashboard`)**: Ported all 15 REST endpoints to Go HTTP server.
- **Pure Go Builder (`scripts/build/main.go`)**: Implemented binary compilation, bundling, and typegen pipeline in Go.

---

### 6.2 Wave 7 Action Items: Roadmap to Pure Go Binary & TS Demolition

Below is the sequential roadmap for **Wave 7** to resolve all identified gaps before TypeScript demolition:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             WAVE 7 EXECUTION ROADMAP                             │
└──────────────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │ Phase 1: Core Registry, Storage & Exec Fixes (Blockers)                        │
 ├────────────────────────────────────────────────────────────────────────────────┤
 │ 1. Fix OctalToDecimalPerm and DecimalToOctalPerm in pkg/registry/registry.go   │
 │ 2. Fix GetFileState in pkg/registry/registry.go to iterate operations backwards│
 │ 3. Fix MemFS.Exists and MemFS.CopyFile symlink handling in pkg/fs/mem_fs.go    │
 │ 4. Fix TrackedFileSystem transaction handling when tx is nil                   │
 │ 5. Wire cmd.Cancel = func() { c.Kill() } in pkg/exec for process group kills   │
 │ 6. Set Timeout: 0 on http.Client in pkg/downloader and rely on context timeouts│
 └────────────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │ Phase 2: Installer Plugin Critical & High Fixes                                 │
 ├────────────────────────────────────────────────────────────────────────────────┤
 │ 1. Fix zsh-plugin ShellInit path generation to use currentDir instead of destDir │
 │ 2. Fix pacman repo prefix stripping (extra/ripgrep -> ripgrep) in pacman.go    │
 │ 3. Replace Rename with CopyFile for system binaries in curl_script.go          │
 │ 4. Implement response caching in github.go to prevent API rate limiting       │
 │ 5. Support tool.InstallParams["version"] across apt, dnf, npm, pacman          │
 │ 6. Implement github-releases binary/version sources in cargo.go               │
 │ 7. Add CLI version detection (versionArgs/versionRegex) to 4 missing installers│
 └────────────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │ Phase 3: CLI Subcommand & UX Alignment                                         │
 ├────────────────────────────────────────────────────────────────────────────────┤
 │ 1. Update cmd/dotfiles/bin.go to support realpath output on stdout for <name>  │
 │ 2. Rewrite cmd/dotfiles/files.go to support <toolName> directory ASCII tree    │
 │ 3. Align cmd/dotfiles/log.go with file registry operations audit               │
 │ 4. Add env create and env delete subcommands in cmd/dotfiles/env.go            │
 │ 5. Align cmd/dotfiles/skill.go with skill template copying to target path       │
 │ 6. Add --force flag to installCmd and align positional arguments              │
 └────────────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴────────────────────────────────────────┐
 │ Phase 4: E2E Test Parity & TypeScript Demolition                               │
 ├────────────────────────────────────────────────────────────────────────────────┤
 │ 1. Translate typeSafety.test.ts to Go E2E test (tests/e2e/type_safety_test.go) │
 │ 2. Verify pkg/dashboard/dist placeholder prevents go test/build embedding errors│
 │ 3. Execute full local check (bun check:ci && go test ./...)                      │
 │ 4. Execute legacy TypeScript demolition: remove packages/ except dashboard/    │
 └────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Due Diligence Findings

Systematic listing of ALL 32 specific architectural gaps, runtime bugs, API deficiencies, and semantic divergences identified during the side-by-side audit:

| ID | Category / Severity | Component / Location | Description of Issue | Impact | Required Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DUE-1** | **Blocker** | `pkg/registry/registry.go:587` | `OctalToDecimalPerm("420")` treats decimal `"420"` (which is `0644` in octal) as octal `0420` and converts to `"272"`. `DecimalToOctalPerm("0755")` parses `"0755"` as base-10 `755` and formats to `"01363"`. | Corrupts file permission modes recorded in SQLite registry database. | Check string prefixes (`0o`, `0`) and handle base-10 vs octal representation correctly. |
| **DUE-2** | **Blocker** | `pkg/registry/registry.go:277` | `GetFileState` inspects only `ops[0]` (newest operation). If latest operation was `chmod`, attributes like `targetPath` or `sizeBytes` recorded during prior `writeFile` or `symlink` are lost (`nil`). | Incomplete file state reported after `chmod` operations. | Iterate chronologically from oldest to newest operation to accumulate active file state. |
| **DUE-3** | **Blocker** | `pkg/fs/mem_fs.go:88` | `MemFS.Exists` checks key presence in `m.files`. Broken symlinks exist in `m.files`, so `Exists` returns `true`. | Inconsistent filesystem behavior in memory mocks vs OSFS during dry-run/tests. | Follow symlinks using `Stat(path)` in `MemFS.Exists`. |
| **DUE-4** | **Blocker** | `pkg/fs/mem_fs.go:420` | When `src` is a symlink, `MemFS.CopyFile` creates `dest` as a symlink pointing to `linkTarget` rather than copying target file contents. | Copies symlink metadata instead of target file bytes in memory filesystem. | Dereference symlinks in `MemFS.CopyFile` to copy target file bytes when `src` is a symlink. |
| **DUE-5** | **Blocker** | `pkg/fs/tracked_fs.go:81` | When `tx` is `nil`, `recordOperation` returns `nil` silently without inserting into `file_operations`. | File operations execute on disk but produce zero registry records unless a transaction is explicitly attached. | Auto-begin a transaction or execute queries directly against `t.reg.db` when `t.tx` is `nil`. |
| **DUE-6** | **High** | `pkg/installer/zsh_plugin.go:163` | `zsh_plugin.go` generates `ShellInit` pointing to temporary staging path `pluginPath` (`destDir`) instead of active tool directory (`currentDir`). | Once temporary staging directory is cleaned up, shell config `source` commands point to non-existent files, breaking zsh startup. | Construct `ShellInit` using `currentDir` instead of temporary staging `pluginPath`. |
| **DUE-7** | **High** | `pkg/installer/pacman.go:91` | `pacman.go` executes `pacman -Q extra/ripgrep` directly without stripping repository prefix (`extra/`). | `pacman -Q` fails on all `repo/package` tools, causing version detection to fail silently. | Strip repository prefix (`extra/`) before passing package name to `pacman -Q`. |
| **DUE-8** | **High** | `pkg/installer/curl_script.go:159` | When searching `/usr/local/bin`, `~/.local/bin`, `/usr/bin`, `curl_script.go` uses `fsys.Rename` to move system binaries to `destDir`. | Moving files out of `/usr/bin` requires root, fails on read-only filesystems, and mutates system binaries. | Always use `CopyFile` instead of `Rename` when copying system binaries. |
| **DUE-9** | **High** | `pkg/exec/os_runner.go:138`, `sysprocattr_unix.go:17` | `exec.CommandContext` does not set `cmd.Cancel`. On timeout/cancellation, Go kills only the leader PID. | Child processes (e.g. `xz` decompressors) leak as orphaned zombies. | Wire `cmd.Cancel = func() error { return c.Kill() }` to kill process group when `Setsid/Setpgid` is set. |
| **DUE-10** | **High** | `pkg/downloader/downloader.go:39` | `http.Client` is initialized with `Timeout: 30 * time.Second`. In Go, `http.Client.Timeout` bounds response body streaming duration. | Large binary/archive/DMG downloads taking > 30s are forcibly killed. | Set `Timeout: 0` on `http.Client` in `NewDownloader` and rely solely on context timeouts. |
| **DUE-11** | **High** | `pkg/installer/github.go:250` | `GitHubInstaller` makes un-cached HTTP GET requests to `api.github.com` on every update check/install. | Multi-tool `dotfiles update` triggers GitHub 60 req/hr rate limit (HTTP 403) and fails remaining tool updates. | Implement response caching for GitHub API release queries with TTL. |
| **DUE-12** | **High** | `pkg/orchestrator/orchestrator.go` | Go `purgeToolState` deletes `binariesDir/toolName` directory when cleaning disabled/orphaned tools. | User binary downloads wiped when disabling a tool in `.tool.ts`. | Separate cleanable artifact deletion (shims, symlinks, copies, completions) from binary uninstallation in `purgeToolState`. |
| **DUE-13** | **High** | `cmd/dotfiles/bin.go` | TS `dotfiles bin <name>` outputs absolute realpath to `<name>` on stdout without newline and exits 1 if not found. Go `bin` prints `binariesDir` or lists configured binaries. | Scripts or completions depending on `dotfiles bin <name>` break. | Update `cmd/dotfiles/bin.go` to support resolving realpaths on stdout for `<name>`. |
| **DUE-14** | **High** | `cmd/dotfiles/files.go` | TS `files <toolName>` renders an ASCII tree of installed files in `<toolName>`'s directory. Go `files` outputs raw DB operations. | Incompatible CLI output format and missing `<toolName>` directory tree inspection. | Rewrite `cmd/dotfiles/files.go` to accept optional `<toolName>` and format directory tree. |
| **DUE-15** | **High** | `cmd/dotfiles/log.go` | TS `log` audits DB file operations. Go `log` tails log files on disk. | Divergent CLI subcommand behavior. | Align `cmd/dotfiles/log.go` with registry operation auditing or introduce subcommands. |
| **DUE-16** | **High** | `cmd/dotfiles/env.go` | Go `env.go` only outputs export statements and lacks `create` and `delete` subcommands. | Virtual environment management unavailable via CLI. | Add Cobra subcommands `create` and `delete` under `envCmd`. |
| **DUE-17** | **High** | `cmd/dotfiles/skill.go` | TS `skill <path>` copies dotfiles agent skill to `<path>/dotfiles`. Go `skill` lists local skills. | Incompatible CLI command behavior. | Support both skill copying to target path and skill discovery subcommands. |
| **DUE-18** | **High** | `pkg/dashboard/dashboard.go` | `//go:embed all:dist` fails standard `go build ./...` or `go test ./pkg/dashboard/...` on clean checkouts if `pkg/dashboard/dist/` is empty or missing. | Standard Go build/test workflows break on fresh checkouts. | Ensure `pkg/dashboard/dist/` contains a default `.gitkeep` or placeholder asset. |
| **DUE-19** | **Medium** | `pkg/downloader/downloader.go:167`, `pkg/installer/github.go:125` | Downloader and GitHub installer send default `Go-http-client/1.1` header. | Requests rejected with HTTP 403/406 by CDNs and anti-bot filters. | Set standard `User-Agent: dotfiles-installer/1.0` header. |
| **DUE-20** | **Medium** | `apt.go:58`, `dnf.go:58`, `npm.go:60`, `pacman.go:58` | `apt`, `dnf`, `npm`, `pacman` installers ignore `tool.InstallParams["version"]` and only check `tool.Version`. | Explicit version parameter overrides in `installParams` fail. | Fall back to `tool.InstallParams["version"]` if `tool.Version` is empty. |
| **DUE-21** | **Medium** | `pkg/installer/cargo.go:168` | Cargo installer lacks `github-releases` `binarySource` / `versionSource` support (`assetPattern`, `githubRepo`, `cargoTomlUrl`). | Rust crates configured to download pre-built GitHub release binaries fail. | Implement `github-releases` source handling in `cargo.go`. |
| **DUE-22** | **Medium** | `curl_binary.go`, `curl_tar.go`, `dmg.go`, `pkg.go` | Installers omit `detectVersionViaCli` execution during `Install`. | Installed binary versions not recorded in installation metadata. | Execute `detectVersionViaCli` using `versionArgs`/`versionRegex` during installation. |
| **DUE-23** | **Medium** | `pkg/installer/manual.go:88` | `manual.go` hardcodes destination binary to `tool.Name`, ignoring custom binary lists in `tool.Binaries`. | Manual tools with multiple/custom binary names fail to register non-default binaries. | Use `GetBinaryNames` and iterate through all configured binaries in `manual.go`. |
| **DUE-24** | **Medium** | `pkg/installer/npm.go:70` | Re-installing npm packages with `--force` does not clean pre-existing binary wrappers in global bin. | npm/bun `EEXIST` errors when reinstalling global packages with `--force`. | Delete existing global binary wrappers when `--force` is enabled. |
| **DUE-25** | **Medium** | `dmg.go:136`, `pkg.go:136` | `dmg` and `pkg` installers make direct GitHub API calls and fail when rate-limited. | Installation fails when GitHub unauthenticated API rate limits are reached. | Port `fetchReleaseViaGhCli` fallback logic from `github.go`. |
| **DUE-26** | **Medium** | `pkg/proxy/proxy.go:412` | `pkg/proxy` rejects `CONNECT` method requests with HTTP 501. | HTTPS tunneling through local caching proxy fails. | Implement TCP hijacking for `CONNECT` method in `proxy.go`. |
| **DUE-27** | **Medium** | `pkg/installer/installer.go:118` | `Registry.List()` iterates over un-sorted Go map keys. | Non-deterministic slice ordering when listing installer plugins. | Sort installer names alphabetically before returning. |
| **DUE-28** | **Medium** | `pkg/arch/arch.go` | `pkg/arch/arch.go` omits `MatchesArchitecture` export matching TS package. | External callers or tests cannot invoke architecture regex matching directly. | Export `MatchesArchitecture` in `pkg/arch/arch.go`. |
| **DUE-29** | **Medium** | `cmd/dotfiles/install.go`, `update.go` | `install` lacks `--force` flag; positional argument requirements differ between TS and Go. | CLI flag incompatibility with existing user scripts. | Add `--force` to `installCmd` and align positional argument validation. |
| **DUE-30** | **Medium** | `pkg/fs/mem_fs.go:260` | `MemFS.ReadDir` returns `nil, nil` instead of `os.ErrNotExist` when directory does not exist in `m.files`. | Readdir callers receive empty slice instead of error for non-existent paths. | Return `os.ErrNotExist` when target directory path is missing in `m.files`. |
| **DUE-31** | **Medium** | `pkg/registry/registry.go:299` | `GetRegisteredTools` executes `SELECT DISTINCT tool_name FROM file_operations` without checking active file count. | Tools whose files were completely removed (`rm`) are still listed as registered tools. | Filter out tools with zero active files. |
| **DUE-32** | **Low** | `pkg/fs/tracked_fs.go:328` | Go `TrackedFileSystem.CopyFile` records operation type as `"writeFile"` instead of `"cp"`. | Discrepancy in file operation audit history types. | Change recorded operation type to `"cp"`. |

---
