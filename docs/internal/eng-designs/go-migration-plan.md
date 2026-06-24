---
created_on: 2026-06-22 12:00
last_modified: 2026-06-23 23:30
status: current
---

# Go Migration Plan

This document defines the engineering specification and package-by-package migration plan for rewriting the TypeScript/Bun-based dotfiles installer monorepo into a single, high-performance, statically compiled Go binary.

## Table of Contents

- [1. Objective and Non-Goals](#1-objective-and-non-goals)
- [2. Current Codebase Baseline](#2-current-codebase-baseline)
- [3. Non-Negotiable Constraints](#3-non-negotiable-constraints)
- [4. Exact Architecture Choice](#4-exact-architecture-choice)
- [5. Data Model / Schema](#5-data-model--schema)
- [6. Types and Contracts](#6-types-and-contracts)
- [7. Exact File Plan](#7-exact-file-plan)
- [8. Runtime Behavior](#8-runtime-behavior)
- [9. Validation Rules](#9-validation-rules)
- [10. Exact API Surface](#10-exact-api-surface)
- [11. Implementation Order](#11-implementation-order)
- [12. Testing Plan](#12-testing-plan)
- [13. Out-of-Scope / Rejection List](#13-out-of-scope--rejection-list)
- [14. Definition of Done](#14-definition-of-done)
- [15. Go 1.26 and Sobek VM Structural Snippets](#15-go-122-and-sobek-vm-structural-snippets)

---

## 1. Objective and Non-Goals

### Objective

- The system must be fully rewritten in Go 1.26.
- The output of the compilation must be a single, standalone, statically compiled executable named `dotfiles` without external runtime dependencies (such as Node.js or Bun required by end users).
- The transition must happen sequentially, package-by-package, tracking dependencies from lowest level to highest level.
- Every Go package must achieve a minimum of 90% function-level testing coverage.
- The migration process must include an automated Dual-Run Parity verification harness (the "Hard Check Gate") that asserts absolute feature and output parity against the legacy TypeScript implementation.
- The system **must maintain support for TypeScript-based tool definitions (`.tool.ts`)**.
- To run TypeScript-based tool definitions within a static Go binary without external execution dependencies, we **must use Sobek** (`github.com/grafana/sobek`), a high-performance pure-Go JavaScript VM.
- To prevent type contract drift and ensure 100% type-safety between Go configurations and TypeScript tool definitions, we **must use a type generation package** (specifically `github.com/tkrajina/typescriptify-golang-structs`) to automatically generate TypeScript interface definitions directly from Go structs during development.

### Non-Goals

- We must not invoke external dynamic runtimes (such as spawning Node.js or Bun processes) at runtime to evaluate user configurations or tool definitions. All evaluation must happen natively within the embedded Sobek VM.
- We must not support Go versions earlier than 1.26.
- We must not modify or re-implement external package managers (e.g., `brew`, `pacman`, `apt`, `cargo`). The Go installers must invoke these commands as subprocesses identically to the TypeScript codebase.
- We must not maintain backward-compatible workarounds for legacy APIs that were already marked as deprecated.

---

## 2. Current Codebase Baseline

The current repository is a Bun-managed TypeScript monorepo with packages partitioned as follows:

- **Core Utilities**:
  - `arch`: Platform/OS and hardware CPU architecture mapping.
  - `archive-extractor`: Extracts `.zip`, `.tar.gz`, `.tar.bz2`, `.dmg`, `.pkg` archives.
  - `file-system`: Abstractions for file system reading, writing, and high-performance in-memory FS used for dry-run modes.
  - `downloader`: HTTP and HTTPS download manager with support for resume and integrity checks.
  - `unwrap-value`: Handles placeholder template evaluation and dynamic value extraction.
  - `utils`: Standard helper functions.
  - `version-checker`: Determines local vs upstream remote versions of packages/tools.
- **Registry & Configuration**:
  - `registry-database`: Pre-configured tools and versions database, utilizing SQLite for transactional state, file operation tracking, and installation registry.
  - `registry`: Resolver logic for tool metadata.
  - `tool-config-builder`: DSL/Builder pattern for generating specific configurations.
  - `config`: Handles configuration parsing and loading of user-defined `dotfiles.config.ts`.
  - `core`: Orchestrates context generation and provides concrete types for the builder.
- **Output Generators**:
  - `shell-emissions`: Generates export commands, alias statements, and path modifications.
  - `shell-init-generator`: Edits shell configuration profiles (`.zshrc`, `.bashrc`, `.profile`) to inject startup scripts.
  - `shim-generator`: Creates lightweight binary/executable wrapper shims.
  - `symlink-generator`: Manages the generation of symlinks.
  - `generator-orchestrator`: Chains generators sequentially.
  - `virtual-env`: Constructs sandboxed local environments.
- **UX & Tooling**:
  - `cli`: Entry point utilizing Commander.js.
  - `dashboard`: React/Vue web application displaying logs, statuses, and tool listings.
  - `http-proxy`: Local cache proxy for HTTP resources.
  - `logger`: `tslog`-based safe logger wrapper utilizing tab-separated log statements.
  - `testing-helpers`: Setup for in-memory filesystems, mock servers, and directory structures.
  - `features`: Implements the documentation services, such as Readme caching and CLI markdown display.
- **Installer Plugins**:
  - Contains 15 specialized package management plugins (`installer-brew`, `installer-cargo`, `installer-curl-binary`, `installer-curl-script`, `installer-curl-tar`, `installer-dmg`, `installer-gitea`, `installer-github`, `installer-manual`, `installer-npm`, `installer-zsh-plugin`, `installer-apt`, `installer-pacman`, `installer-dnf`, `installer-pkg`).

All dependencies are resolved via `bun.lockb` and run using the Bun runtime.

---

## 3. Non-Negotiable Constraints

- **Absolute 100% Parity (Zero Tolerated Gaps)**: The rewritten Go codebase must behave 100% identically to the legacy TypeScript implementation under all command arguments, options, execution flags (especially `--dry-run`), stdout/stderr logs, folder outputs, and SQLite database tracking states. No deliberate simplifications, architectural deviations, or tracking trade-offs are permitted.
- **Low-Level FS Tracking (`TrackedFileSystem`)**: The `pkg/fs` module must implement a transaction-safe database tracking file system wrapper that automatically intercepts file creation, modifications, permissions, and directory operations (such as `writeFile`, `chmod`, `mkdir`) and commits corresponding entries (`OperationType`, `SizeBytes`, `Permissions`) to `registry.db` matching TS's exact low-level tracking records.
- **Cobra CLI Command Semantics Alignment**: Go CLI subcommands must mirror TypeScript's execution flow exactly. The `generate` command must only perform standalone file generations (shims, symlinks, completions, shell profile inits) and must strictly avoid invoking full installation pipelines unless `auto: true` is configured for the tool.
- **Language Standard**: The rewritten codebase must use Go 1.26. It must utilize newer Go features such as generic type aliases, first-class module tool directives in `go.mod`, and Go 1.26-specific `new(expr)` inline pointer allocations for simplified initializations.
- **No Heavy Third-Party Frameworks**: Standard library features must be prioritized.
  - **HTTP requests**: Must use native `net/http` with custom transport configurations.
  - **Structured Logging**: Must use `log/slog` for zero-allocation structured logging, configured with a handler that mimics the TS `tslog` tab-delimited format.
  - **JSON/YAML validation**: Validation of configuration files must use explicit `Validate() error` method receivers on parsed structs instead of massive validation libraries.
- **Goroutine Ownership**: Every goroutine launched must be tracked by a `sync.WaitGroup` or managed context. Channels and Select blocks must include timeouts or cancellation listeners to prevent goroutine leaks.
- **No Compiled Binaries in Git**: All compiled executables must be excluded via `.gitignore` and must never be checked into the source tree. This constraint must also apply to build-time generated artifacts; specifically, the transpiled JavaScript files generated in `pkg/vm/dist/` must be excluded in `.gitignore` to prevent pre-compiled bundles from contaminating the repository.
- **TypeScript-Based Tool Execution (Sobek Engine)**: To support `.tool.ts` files, we must compile/bundle these TypeScript definitions into standard ES5/ES6 JavaScript during the compilation/packaging phase using Bun (`bun build`), embed the compiled JS using Go's standard `//go:embed` directive, and execute them natively inside the Go binary via **Sobek** (`github.com/grafana/sobek`). This guarantees 100% standalone execution without needing external JavaScript engines at runtime.
- **Type Generation and Schema Parity**: We must eliminate structural drift between Go structs and TypeScript configs. We must use **`github.com/tkrajina/typescriptify-golang-structs`** in a dedicated code-generation script to convert core Go structs (e.g., `ToolConfig`, `ProjectConfig`) into their TypeScript equivalents during development. The generated TypeScript interfaces must serve as the foundation of the `.tool.ts` definitions. To guarantee seamless mapping during Sobek's VM reflection unmarshaling, all Go configuration structs in `pkg/config` must carry explicit `json` and `yaml` struct tags that map exactly to camelCase TypeScript properties (e.g. `json:"installMethod"`), preventing silent unmarshaling drops.
- **Command-Line Parsing**: The CLI entrypoint must use the `github.com/spf13/cobra` package.
- **State Registry Persistence**: We must maintain an SQLite-backed registry database identically to the TypeScript implementation. To avoid breaking user environments, maintaining full binary compile portability, and eliminating heavy platform dependencies, the Go application must use a zero-dependency, CGO-free, pure-Go SQLite driver (specifically `modernc.org/sqlite`).

---

## 4. Exact Architecture Choice

### Go Monorepo Structure

We must use a **single Go module** named `github.com/alexgorbatchev/dotfiles` placed at the workspace root directory. We must not use Go workspaces (`go.work`) or multiple nested modules, as a single-module structure eliminates version coordination complexity and simplifies dependency management.

The folder structure must be:

- `/go.mod` (The root Go module)
- `/cmd/dotfiles/` (The entry point compiled to produce the `dotfiles` binary, structured as modular subcommand files)
- `/pkg/` (The collection of subpackages mapping to the original monorepo)

### Directory Mapping

| TS Workspace Package           | Go Subpackage Path | Primary Responsibility                                                                                         |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `utils`                        | `pkg/utils`        | Pure functional helpers (strings, lists, slices).                                                              |
| `logger`                       | `pkg/logger`       | `log/slog` wrapper implementing tab-delimited user-facing log format.                                          |
| `arch`                         | `pkg/arch`         | OS and CPU hardware mappings, Libc detection.                                                                  |
| `file-system`                  | `pkg/fs`           | Interface `FS` with standard OS and MemFS, and the database-transactional low-level TrackedFS interceptor.     |
| `downloader`                   | `pkg/downloader`   | HTTP client with resume-capability, SHA256 validation.                                                         |
| `archive-extractor`            | `pkg/archive`      | Wrapper around `archive/tar`, `archive/zip` and external format invocation.                                    |
| `unwrap-value`                 | `pkg/unwrap`       | Pattern replacer (e.g., `{{ .Version }}`, `{{ .Arch }}`).                                                      |
| `version-checker`              | `pkg/version`      | Evaluator of semver boundaries and local/remote versions.                                                      |
| `config`                       | `pkg/config`       | Struct schemas for configuration files, also hosting structs that generate TS types.                           |
| `tool-config-builder` & `core` | `pkg/vm`           | Pure-Go **Sobek** Javascript VM initializer, custom Go-to-JS bindings, and TypeScript bundle execution runner. |
| `registry-database`            | `pkg/db`           | Pure-Go SQLite database connections, schema provisioning, and transactional engines.                           |
| `registry`                     | `pkg/registry`     | DB access models for `file_operations` and `tool_installations`.                                               |
| `shell-emissions`              | `pkg/shell`        | Generating alias, export, and path extension directives.                                                       |
| `shell-init-generator`         | `pkg/shellinit`    | Injects dotfiles setup blocks and sources into Shell profile scripts (`.zshrc`, `.bashrc`).                    |
| `symlink-generator`            | `pkg/symlink`      | Evaluator and creator of system symbolic links.                                                                |
| `shim-generator`               | `pkg/shim`         | Generates shell executable script shims.                                                                       |
| `virtual-env`                  | `pkg/venv`         | Manages localized environment sandboxes.                                                                       |
| `generator-orchestrator`       | `pkg/orchestrator` | Coordinates standalone generators, runs auto-installs, and manages file cleanups cleanly.                      |
| `installer`                    | `pkg/installer`    | Core interfaces, execution state management, and the 15 installer plugins.                                     |
| `features`                     | `pkg/features`     | Handles documentation rendering, README parsing, and caching.                                                  |
| `dashboard`                    | `pkg/dashboard`    | Embedded static dashboard webassets running on a `net/http` backend.                                           |
| `http-proxy`                   | `pkg/proxy`        | Local asset caching proxy.                                                                                     |

---

## 5. Data Model / Schema

### State Registry Database

The local installation state must be persisted using an SQLite database in the user's configuration folder under `~/.config/dotfiles/registry.db`.

The database schema must match the following structures identically, and we must define these Go structures using struct tags for SQL driver compatibility:

```go
package registry

type FileOperationRecord struct {
	ID            int64   `db:"id"`
	ToolName      string  `db:"tool_name"`
	OperationType string  `db:"operation_type"` // e.g., "symlink", "shim", "write"
	FilePath      string  `db:"file_path"`
	TargetPath    *string `db:"target_path"`
	FileType      string  `db:"file_type"`
	Metadata      *string `db:"metadata"`
	SizeBytes     *int64  `db:"size_bytes"`
	Permissions   *string `db:"permissions"`
	CreatedAt     int64   `db:"created_at"` // Unix millisecond epoch
	OperationID   string  `db:"operation_id"`
}

type ToolInstallationRecord struct {
	ID                int64   `db:"id"`
	ToolName          string  `db:"tool_name"`
	Version           string  `db:"version"`
	InstallPath       string  `db:"install_path"`
	Timestamp         string  `db:"timestamp"`
	InstalledAt       int64   `db:"installed_at"` // Unix millisecond epoch
	BinaryPaths       string  `db:"binary_paths"` // JSON array string
	DownloadURL       *string `db:"download_url"`
	AssetName         *string `db:"asset_name"`
	ConfiguredVersion *string `db:"configured_version"`
	OriginalTag       *string `db:"original_tag"`
	InstallMethod     *string `db:"install_method"`
}
```

### Config Model

The user configuration structures must map exactly to the schema output defined by `packages/core/src/config/projectConfigSchema.ts`. This configuration struct (and related fields) will be registered inside `scripts/typegen` to emit corresponding TypeScript type definitions.

---

## 6. Types and Contracts

### Core Installer Interface

All sub-installers must satisfy the following core `Installer` interface:

```go
package installer

import (
	"context"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

type InstallResult struct {
	Binaries []string
	ShellEnv map[string]string
}

type UpdateCheckResult struct {
	HasUpdate     bool
	LocalVersion  string
	LatestVersion string
}

type Installer interface {
	Name() string
	SupportsSudo() bool
	Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error)
	Uninstall(ctx context.Context, tool *config.ToolConfig) error
	CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error)
}
```

### Mockable Terminal Command Runner

To achieve a minimum of 90% test coverage without invoking live CLI mutations during package testing (e.g. running active `brew install` commands), all installer implementations must execute subprocess operations via the `CommandRunner` interface:

```go
package exec

import "context"

type Cmd struct {
	Path string
	Args []string
	Dir  string
	Env  map[string]string
}

type RunResult struct {
	ExitCode int
	Stdout   []byte
	Stderr   []byte
}

type CommandRunner interface {
	Run(ctx context.Context, cmd Cmd) (*RunResult, error)
}
```

### File System Interface

The file system interactions must be abstracted via the `FS` interface to enable deterministic, concurrent unit testing without writing to the physical disk:

```go
package fs

import (
	"io"
	"os"
)

type FS interface {
	ReadFile(path string) ([]byte, error)
	WriteFile(path string, data []byte, perm os.FileMode) error
	Remove(path string) error
	Exists(path string) (bool, error)
	MkdirAll(path string, perm os.FileMode) error
	Create(path string) (io.WriteCloser, error)
	Open(path string) (io.ReadCloser, error)
}
```

### Sobek VM Tool Definition Execution Contract

The Sobek VM package `pkg/vm` must expose a runner function with the following signature to execute TypeScript-compiled tool definitions and extract standard Go configurations:

```go
package vm

import (
	"context"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// EvaluateToolDefinition executes the JS-bundled tool definition script in the Sobek VM,
// passing in environment context parameters, and marshals the evaluated JS result
// directly into the strongly typed Go ToolConfig.
func EvaluateToolDefinition(ctx context.Context, scriptContent []byte, sysCtx *config.SystemContext) (*config.ToolConfig, error)
```

---

## 7. Exact File Plan

### Root

- `go.mod` - Declares module `github.com/alexgorbatchev/dotfiles` and lists dependencies (`spf13/cobra`, `modernc.org/sqlite`, `github.com/grafana/sobek`, `github.com/tkrajina/typescriptify-golang-structs`).
- `go.sum` - Checksums for Go packages.
- `Makefile` - Tasks for compile (`make build`), test (`make test`), and format check (`make lint`). Includes pre-compilation rules for compiling TypeScript tool-definitions with Bun and running type-generation.

### Main CLI Subcommands

Instead of a monolithic main file, subcommands must be split into dedicated modular files to maximize testability and reuse:

- `cmd/dotfiles/main.go` - Entry point bootstrapping Cobra commands.
- `cmd/dotfiles/root.go` - Core Cobra base configuration.
- `cmd/dotfiles/generate.go` - Command handler for output generation.
- `cmd/dotfiles/install.go` - Command handler for installations.
- `cmd/dotfiles/uninstall.go` - Command handler for uninstallation.
- `cmd/dotfiles/update.go` - Command handler for upgrading tools.
- `cmd/dotfiles/env.go` - Command handler for environment display.
- `cmd/dotfiles/files.go` - Command handler for file operation logs.
- `cmd/dotfiles/dashboard.go` - Command handler for Web dashboard.
- `cmd/dotfiles/convert.go` - Command handler for config migration.

### Package Structures

- `pkg/utils/utils.go` - Slices, platform string parsers, path utilities.
- `pkg/logger/logger.go` - Wrapper around `log/slog` writing tab-separated output to `os.Stderr`.
- `pkg/logger/log_messages.go` - Package-level central structured messages definition.
- `pkg/arch/arch.go` - Methods to evaluate host hardware configurations and Libc implementations (glibc/musl).
- `pkg/fs/fs.go` - File system interface and utilities.
- `pkg/fs/os_fs.go` - Operating-system-backed implementation of FS interface.
- `pkg/fs/mem_fs.go` - Multi-mutex protected in-memory file system mocking disk interactions.
- `pkg/exec/exec.go` - Executions, subprocess runner interfaces.
- `pkg/exec/os_runner.go` - Subprocess runner mapping to `os/exec`.
- `pkg/exec/mock_runner.go` - Test double command runner for mocking terminal commands.
- `pkg/downloader/downloader.go` - Native Go HTTP/HTTPS downloader with support for context cancel.
- `pkg/archive/archive.go` - Integrates extraction for Zip, Tar, Gzip, and calls external dmg/pkg utilities.
- `pkg/unwrap/unwrap.go` - Regex template unwrapper using Go's `text/template` engine.
- `pkg/config/config.go` - Configuration structures matching the TS configurations. Serves as source for type generator.
- `pkg/vm/vm.go` - Sobek VM context orchestrator, managing VM pools and execution.
- `pkg/vm/bindings.go` - Implements standard Go callback bindings exposed inside the JS engine (e.g., helper functions, platform detectors).
- `pkg/vm/embed_gen.go` - Carries standard `//go:embed` references containing compiled and pre-bundled `.tool.js` script definitions.
- `pkg/db/db.go` - Pure-Go SQLite connection pooling and structural migration runner.
- `pkg/registry/registry.go` - Core querying layer for database tracking records.
- `pkg/shell/shell.go` - Generates execution scripts.
- `pkg/shellinit/shellinit.go` - Injects setup triggers to main system profile targets.
- `pkg/symlink/symlink.go` - Core symlink evaluation algorithms.
- `pkg/shim/shim.go` - Creates script wrappers.
- `pkg/venv/venv.go` - Establishes path-isolated execution folders.
- `pkg/orchestrator/orchestrator.go` - Executes generator steps in topological priority order.
- `pkg/features/readme.go` - Processes tool and package usage files.
- `pkg/installer/installer.go` - Registry manager matching strings to specific Installer interfaces.
- `pkg/installer/brew.go` - Homebrew installer wrapper.
- `pkg/installer/cargo.go` - Cargo installer wrapper.
- `pkg/installer/curl_binary.go` - Raw curl installer wrapper.
- `pkg/installer/github.go` - GitHub Release downloader wrapper.
- `pkg/installer/npm.go` - npm installer wrapper.
- `pkg/installer/...` - Individual files for the other 10 installer plugins.

### Development Utilities

- `scripts/typegen/main.go` - Executes `typescriptify-golang-structs` to compile Go config structures directly into standard TypeScript file (`packages/core/src/types.gen.ts`).
- `scripts/parity-harness/main.go` - The Hard Check Gate verification tool.

---

## 8. Runtime Behavior

### Build & Compilation Pipeline (Development & Packaging)

1. Developer modifies Go struct types in `pkg/config/config.go`.
2. Developer runs `make typegen` which executes `scripts/typegen/main.go`, emitting synchronized TypeScript type definitions directly to `packages/core/src/types.gen.ts`.
3. TypeScript-based tool definitions (`.tool.ts`) consume these types to ensure type safety.
4. During building/packaging, `bun build` transpiles and bundles `.tool.ts` files into flat ES5/ES6 Javascript files under `pkg/vm/dist/`.
5. The `go build` compiler is invoked. The compiled Javascript files in `pkg/vm/dist/` are statically embedded inside the compiled `dotfiles` binary using the standard `//go:embed` directive.

### Application Bootstrap (End-User Runtime)

1. The Cobra CLI factory configures and registers subcommand files under `cmd/dotfiles/`.
2. The logger initializes a custom `slog.Handler` formatting logs into the standard tab-delimited layout.
3. The configuration parser loads `dotfiles.config.json` or `dotfiles.config.yaml` using `pkg/config`.
4. The system detects the host CPU, OS, and Libc type via `pkg/arch`.
5. The config model is validated.
6. The `FS` and `CommandRunner` instances are injected.

### Sobek VM Tool Evaluation Workflow

1. For each target tool:
   - Resolves the embedded Javascript file matching the tool name.
   - Instantiates a isolated **Sobek** VM context (`pkg/vm`).
   - Configures and exposes system parameter bindings (OS, Architecture, paths) to the global JS space.
   - Executes the tool's bundled Javascript.
   - Queries the VM for the generated configuration object and unmarshals the dynamic values directly into the concrete Go `config.ToolConfig` struct.
2. **`dotfiles generate` Workflow**:
   - The CLI sorts configurations topologically and executes only the decoupled standalone generators (`pkg/shim`, `pkg/symlink`, `pkg/shellinit`, `pkg/venv`).
   - No installation logic is triggered on non-auto tools.
   - Low-level file system calls (such as `WriteFile`, `Remove`, `MkdirAll`, `Chmod`) are dynamically intercepted by the `TrackedFileSystem` wrapper.
   - For every written file, `TrackedFileSystem` transactionally logs detailed `writeFile` and `chmod` rows in `registry.db` via `pkg/registry`, including calculated `size_bytes` and octal Unix `permissions`, matching TS CLI's implicit database tracking exactly.
3. **`dotfiles install` Workflow**:
   - The CLI sorts configurations topologically and invokes the core installer plugins (`pkg/installer`) sequentially to fetch, compile, and configure tools.
   - Upon successful installation, the orchestrator transactionally writes `ToolInstallationRecord` entries to `registry.db` via `pkg/registry`.

---

## 9. Validation Rules

- **Strict Schema Check**: Every parsed configuration struct must implement the `Validator` interface:
  ```go
  type Validator interface {
      Validate() error
  }
  ```
- **Constraint Rules**:
  - `ProjectConfig`: The working directory must exist or be creatable.
  - `ToolConfig`: The name must be non-empty. It must specify at least one installation method or valid shell generator.
  - `SymlinkConfig`: The source path must be absolute or relative to the workspace.

---

## 10. Exact API Surface

The CLI compiled binary must support these subcommands and flags, configured dynamically through Cobra command factory injection:

- `dotfiles generate` - Orchestrates shim and symlink generation.
  - `--config, -c STRING` (Path to configuration file)
  - `--dry-run, -d` (Simulate without committing disk changes)
- `dotfiles install [tool]` - Installs either a single specified tool or all tools defined in the configuration.
  - `--config, -c STRING`
  - `--dry-run, -d`
- `dotfiles uninstall [tool]` - Uninstalls a specific tool and cleans up matching shims/symlinks.
- `dotfiles update` - Evaluates versions and installs newer software packages if available.
- `dotfiles env` - Outputs export strings for current shell settings.
- `dotfiles files` - Lists files and locations managed by dotfiles installer.
- `dotfiles dashboard` - Starts local HTTP web server and outputs the URL.
  - `--port, -p INT` (Defaults to `8080`)
- `dotfiles config convert` - Helper to migrate a TS config file to JSON.
  - `--input, -i STRING` (Default `dotfiles.config.ts`)
  - `--output, -o STRING` (Default `dotfiles.config.json`)

---

## 11. Implementation Order

To mitigate integration risk, work must progress in sequential tiers from zero-dependency packages to high-dependency entrypoints:

1. **Tier 1 (Core Utilities)**: `pkg/utils`, `pkg/logger` (slog-based tab format), `pkg/arch`, `pkg/fs` (core interfaces and memory fakes).
2. **Tier 2 (Execution & Script VM)**: `pkg/exec` (command interfaces, runner patterns, testing mocks), `pkg/vm` (Sobek VM integrations, Go-to-JS bindings), `scripts/typegen` (Type generation scripting).
3. **Tier 3 (I/O & Storage Engines)**: `pkg/downloader`, `pkg/archive`, `pkg/unwrap`, `pkg/db` (SQLite connection manager), `pkg/registry` (database models and tables).
4. **Tier 4 (Configuration Systems)**: `pkg/config` (shared models and validations), `pkg/version`.
5. **Tier 5 (Generators & Documentation)**: `pkg/shell`, `pkg/shellinit`, `pkg/symlink`, `pkg/shim`, `pkg/venv`, `pkg/features`.
6. **Tier 6 (Orchestration & Drivers)**: `pkg/installer` (core registration drivers), `pkg/orchestrator` (execution and dependency solvers).
7. **Tier 7 (Installer Plugins)**: Incrementally write individual installer files in `pkg/installer/` (such as `brew.go`, `cargo.go`, `github.go`, etc.) injecting the `CommandRunner` wrapper.
8. **Tier 8 (CLI Command & Web Server)**: `cmd/dotfiles/` (Cobra commands mapping), `pkg/dashboard`, `pkg/proxy`.
9. **Tier 9 (Go-Native E2E Test Suite)**: `tests/e2e/` (Migrated end-to-end test suite asserting shims, generators, envs, updates, conflicts, and install commands).

---

## 12. Testing Plan

### 90% Function-Level Target

- Every Go package must maintain a minimum function coverage of 90%.
- We must execute testing using `go test -coverprofile=coverage.out ./...` and verify coverage levels programmatically on CI.

### Isolation Strategy

- No unit tests must issue active network queries. Instead, tests must configure custom HTTP clients targeting a local mock server instantiated via `httptest.NewServer`.
- All disk reads and writes inside package tests must target the `pkg/fs.MemFS` in-memory structure or use `t.TempDir()`.
- No installer test must call the system terminal directly. Instead, installer units must consume a `MockCommandRunner` which returns mock outputs and captures the calls for rigorous semantic assertion.
- All Sobek VM tests must execute using statically mocked JS scripts inside testing tables, completely decoupled from local `.tool.ts` paths.

### The Hard Check Gate (Dual-Run Parity Verification Harness)

To guarantee full feature parity, we must implement an automated verification harness in `scripts/parity-harness/main.go`. This tool must perform the following actions:

1. Compile the newly created Go binary (`.dist/dotfiles`).
2. Execute the legacy TypeScript CLI (`bun cli`) against the standard workspace fixture projects (`test-project-npm` and `test-project-compiled`) in `--dry-run` mode to prevent state mutation, capturing emitted shims, configurations, and console logs inside `.generated/ts/`.
3. Execute the compiled Go CLI (`.dist/dotfiles`) against the exact same fixture projects in `--dry-run` mode, writing outputs to `.generated/go/`.
4. Normalize outputs to prevent false negatives across execution platforms:
   - **Line Endings**: Convert CRLF to LF on all generated shims and configs before running bytes-by-bytes matches.
   - **Absolute Paths**: Replace host-specific directory names (e.g. `/home/alex` or `C:\Users\alex`) dynamically with `{{HOME}}` in compared logs and shims.
   - **Database Parity Validation**: Open and query the generated SQLite databases on both sides, asserting absolute semantic parity of all rows across `file_operations`, `tool_installations`, and `tool_usage` tables (including matching calculated file sizes, file types, operation types like `writeFile` vs `chmod`, permissions, and tool metadata records), while masking only auto-incrementing primary IDs and dynamic Unix timestamps.
5. Concurrently traverse and compare `.generated/ts/` and `.generated/go/`.
6. If there is any mismatch, the harness must write a detailed diff to standard output and exit with exit code `1`.
7. This parity test harness must run as the final gate in the CI script before accepting a package migration as complete.

### Go-Native E2E Test Suite Migration

To replace the legacy `packages/e2e-test` Bun-based testing framework once the migration is complete, we must implement a native Go end-to-end testing suite in `tests/e2e/`.

#### 1. Architecture of Go-Native E2E Test Suite

The Go-native E2E suite must execute real compiled binary commands against test configurations and assert actual filesystem state and logs.

- **Location**: Test files must reside in `tests/e2e/`.
- **Pre-requisite Build**: All E2E tests must depend on a compiled Go executable at `.dist/dotfiles`. The tests must locate this executable or compile it dynamically under `t.TempDir()` during the suite initialization phase if it is missing.
- **Strict Sandbox Isolation**:
  - Each E2E test must create an isolated sandbox directory using `t.TempDir()`.
  - The test must configure its environment variables specifically targeting this sandbox directory (e.g. setting custom mock `HOME`, `XDG_CONFIG_HOME` pointing inside `t.TempDir()`).
  - This eliminates global state contamination and allows safe parallel test execution (`t.Parallel()`).
- **In-Memory and Local Mock HTTP Server**:
  - The E2E test suite must utilize `net/http/httptest` to spin up isolated local mock HTTP servers on a per-test/per-suite basis.
  - The mock server must emulate GitHub API endpoints (`/repos/...`), Gitea releases, and static asset download requests (e.g., serving pre-compiled mock `.tar.gz` and `.zip` archives).

#### 2. E2E Test Harness Contract

To facilitate straightforward test authorship, we must implement a reusable `TestHarness` struct inside `tests/e2e/harness.go`. The harness must expose the following interface:

```go
package e2e

import (
	"testing"
)

type TestHarness struct {
	T             *testing.T
	TempDir       string
	BinPath       string
	ConfigPath    string
	MockServerURL string
}

func NewTestHarness(t *testing.T, options HarnessOptions) *TestHarness

// Command execution wrappers
func (h *TestHarness) RunCommand(args ...string) (stdout, stderr string, exitCode int, err error)
func (h *TestHarness) Generate(args ...string) (stdout, stderr string, exitCode int, err error)
func (h *TestHarness) Install(tools []string, args ...string) (stdout, stderr string, exitCode int, err error)
func (h *TestHarness) Update(toolName string, args ...string) (stdout, stderr string, exitCode int, err error)

// Assertions on filesystem and files
func (h *TestHarness) AssertFileExists(path string)
func (h *TestHarness) AssertFileContentContains(path string, expected string)
func (h *TestHarness) AssertShimExistsAndExecutable(shimName string)
func (h *TestHarness) AssertShellInitContains(shellType string, expected string)
func (h *TestHarness) AssertEnvironmentVariable(toolName, varName, expectedValue string)
func (h *TestHarness) AssertAlias(toolName, aliasName, expectedCommand string)
func (h *TestHarness) AssertOnceScriptContains(toolName, content string)
func (h *TestHarness) AssertAlwaysScriptContains(toolName, content string)

// Assertions on the persisted SQLite database state
func (h *TestHarness) AssertDBOperationLogged(toolName, opType, filePath string)
func (h *TestHarness) AssertDBToolInstalled(toolName, version string)
```

#### 3. Scope of Migrated Test Coverage

The migrated suite must cover the following test cases identically to the legacy implementation:

- **`generate` command**: Assert generation of shims, shell scripts, completions, and environment initializations.
- **`install` command**: Run system and language package installer plugins, asserting `CommandRunner` invocations and successful database-tracking writes.
- **`update` command**: Trigger updates for installed mock tools, asserting upstream version evaluation and execution.
- **Dependency solver**: Assert correct sorting, error on ambiguous binary dependencies, and error on missing dependencies.
- **Conflict detection**: Assert identifying conflicts when target directories contain pre-existing unmanaged configurations or binaries.

---

## 13. Out-of-Scope / Rejection List

- **No Heavyweight Dynamic JS Runtimes at Runtime**: We explicitly reject calling dynamic JS runtimes like spawning external Bun/Node.js subprocesses to compile or load configurations at runtime. All JS execution must happen natively within the embedded Sobek VM.
- **No Console Logging**: Packages under `pkg/` must never write directly to `os.Stdout` or `os.Stderr` via `fmt.Println` or `println`. They must log via slog using structural sublogger hierarchy matching standard patterns:
  ```go
  // Injected sublogger containing hierarchy info
  pkgLogger := parentLogger.With("pkg", "archive").With("func", "Extract")
  ```
- **No Global Mutex Pools**: Locks must be strictly encapsulated inside the structs requiring synchronization (e.g., `pkg/fs.MemFS`).

---

## 14. Definition of Done

A package migration task is defined as 100% complete only when it meets the following objective metrics:

1. **Compilation**: The package and its tests compile under Go 1.26 without errors or warnings.
2. **Quality Checks**:
   - `go vet` returns zero findings.
   - `golangci-lint` passes with zero issues.
   - `go fmt` has been run on all source files.
3. **Tests**: Unit tests pass cleanly with `go test ./...`.
4. **Coverage**: Function-level coverage is validated to be at or above 90%.
5. **Hard Check Gate**: The Dual-Run Parity verification harness passes cleanly.
6. **Review Sweep**: A mandatory review pass is completed using a review subagent with zero remaining issues.

---

## 15. Go 1.26 and Sobek VM Structural Snippets

### Go 1.26 `new(expr)` Allocations

Below is an illustration demonstrating the application of Go 1.26 `new(expr)` inline pointer allocations within configuration parsing blocks:

```go
package main

import (
	"fmt"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

func main() {
	// Go 1.26 inline allocation of computed values avoiding string pointer wrapper helpers
	toolCfg := &config.ToolConfig{
		Name:    "bat",
		Version: new("latest"),
	}
	fmt.Printf("Configured tool: %s with version pointer address: %p\n", toolCfg.Name, toolCfg.Version)
}
```

### Sobek VM JS Evaluation and Go-Struct Mapping

Below is an illustrative implementation snippet demonstrating the execution of TypeScript-transpiled Javascript tool-definitions and mapping the resulting JS objects directly into Go configuration structs:

```go
package vm

import (
	"context"
	"fmt"
	"github.com/grafana/sobek"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

type SystemContext struct {
	OS   string
	Arch string
}

func EvaluateToolDefinition(ctx context.Context, scriptContent []byte, sysCtx *SystemContext) (*config.ToolConfig, error) {
	vm := sobek.New()

	// 1. Inject OS and Architecture variables into the JavaScript global context
	if err := vm.Set("HOST_OS", sysCtx.OS); err != nil {
		return nil, fmt.Errorf("failed to bind HOST_OS: %w", err)
	}
	if err := vm.Set("HOST_ARCH", sysCtx.Arch); err != nil {
		return nil, fmt.Errorf("failed to bind HOST_ARCH: %w", err)
	}

	// 2. Execute the pre-compiled JS tool-definition bundle
	if _, err := vm.RunString(string(scriptContent)); err != nil {
		return nil, fmt.Errorf("execution error inside JavaScript VM: %w", err)
	}

	// 3. Query the JavaScript VM for the defined 'tool' definition object
	val := vm.Get("tool")
	if val == nil || sobek.IsUndefined(val) {
		return nil, fmt.Errorf("tool definition was not exported to global 'tool' variable")
	}

	// 4. Extract the JS object and map it directly into the Go struct
	var toolCfg config.ToolConfig
	if err := vm.ExportTo(val, &toolCfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JavaScript tool configuration to Go struct: %w", err)
	}

	return &toolCfg, nil
}
```
