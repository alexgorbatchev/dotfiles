---
created_on: 2026-10-11 11:49
last_modified: 2026-10-11 11:49
status: current
---

# Git file retrieval Go API

`github.com/alexgorbatchev/dotfiles/pkg/catalog` retrieves native Git objects without executing tool source. The [catalog CLI reference](../getting-started/catalog.md#fetch) owns command options, source/destination layout, file limits and operational constraints.

`FetchOptions` contains `ID`, `Repository`, `Ref`, `TemporaryDir`, `ToolsDir` and `DryRun`. `Validate() error` checks the tool ID, repository transport and ref selector before Git or filesystem access. `TemporaryDir` and `ToolsDir` must be absolute native paths. The runner must be nonnil.

`Fetch(ctx context.Context, runner exec.CommandRunner, options FetchOptions) (FetchResult, error)` requires the existing native Git executable and the physical filesystem. It creates a unique temporary bare object database, resolves the selected ref to a commit, validates and reads the selected files, and optionally imports them. It uses the project's command runner with cancellation and process-group isolation, not an HTTP API client. Dry runs still retrieve and validate the source but skip the import. Scratch cleanup errors are returned alongside operation errors. Cancellation remains detectable through `errors.Is`.

`FetchResult` contains `ID`, `Repository`, `Commit`, `SourcePath`, `Destination`, `Files` and `DryRun`. Files are relative local names, including the renamed main definition. The Git commit is the provenance of this individual retrieval; the command creates no persistent import lock or update bases.

## Local project loading

`vm.LoadProjectConfig(log *logger.Logger, fsys fs.FS, configPath string, opts ...vm.Option) (*config.ProjectConfig, error)` compiles and evaluates the local project configuration and resolves its paths and platform overrides. It does not discover tool files or evaluate their factories. The normal full loader reuses this project-loading step before tool discovery. Local configuration code remains executable code, not a sandboxed data format.

## Exclusive destination creation

`fs.OSFS.Mkdir(path string, perm os.FileMode) error` creates one new directory through the native `os.Mkdir` primitive. Unlike `MkdirAll`, it refuses an existing entry and a missing parent. Fetch uses it to reserve a fresh destination before copying files; it cannot adopt or merge into an existing destination. This concrete OS filesystem operation does not change the shared `fs.FS` interface or registry tracking.
