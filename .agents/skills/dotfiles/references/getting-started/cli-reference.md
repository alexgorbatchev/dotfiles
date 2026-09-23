# CLI Reference

The `dotfiles` CLI is organized around a subject-first command hierarchy (`dotfiles <subject> <verb> [args]`):

```bash
# Managed tool configurations (.tool.ts) & packages
dotfiles tool list
dotfiles tool info fzf
dotfiles tool which fzf
dotfiles tool which --bin fzf
dotfiles tool install fzf
dotfiles tool uninstall fzf
dotfiles tool update fzf
dotfiles tool check --json
dotfiles tool validate fzf --json
dotfiles tool files fzf
dotfiles tool scaffold

# System, binary, and storage path queries
dotfiles path
dotfiles path list
dotfiles path get target
dotfiles path get binaries

# Interactive shell integration & collision audits
dotfiles shell init zsh
dotfiles shell audit

# Isolated dotfiles virtual environments
dotfiles venv list
dotfiles venv create myenv
dotfiles venv delete myenv

# System state, drift detection, and orchestration
dotfiles state generate
dotfiles state diff
dotfiles state cleanup
dotfiles state log fzf --tail 50

# Web dashboard UI
dotfiles dashboard
dotfiles dashboard start --port 8080

# AI Agent skill definitions
dotfiles skill .agents/skills/
dotfiles skill copy .agents/skills/

# Self-management
dotfiles self version
dotfiles self upgrade
dotfiles self upgrade --check

# Top-level convenience shortcuts
dotfiles g                     # shortcut for dotfiles state generate
dotfiles i fzf                 # shortcut for dotfiles tool install fzf
dotfiles u                     # shortcut for dotfiles tool update
dotfiles version               # shortcut for dotfiles self version
```

## Top-Level Shortcuts

For everyday convenience, the most high-frequency commands provide top-level root shortcuts (registered as hidden commands to preserve clean `--help` output) along with single-letter aliases:

| Shortcut                                   | Canonical Command                 | Description                                             |
| :----------------------------------------- | :-------------------------------- | :------------------------------------------------------ |
| `dotfiles generate`, `dotfiles g`          | `dotfiles state generate`         | Compile and link shims, symlinks, blocks, and templates |
| `dotfiles install [tool...]`, `dotfiles i` | `dotfiles tool install [tool...]` | Install one or all configured tools                     |
| `dotfiles update [tool...]`, `dotfiles u`  | `dotfiles tool update [tool...]`  | Upgrade tools to their latest available release         |
| `dotfiles version`                         | `dotfiles self version`           | Print the dotfiles CLI version                          |

Inside their respective domains, the same single-letter aliases are supported:

- `dotfiles state g` -> `dotfiles state generate`
- `dotfiles tool i` -> `dotfiles tool install`
- `dotfiles tool u` -> `dotfiles tool update`

## Command Details

### `dotfiles tool`

Commands that manage configured tools, lifecycles, and binary lookups.

#### `dotfiles tool list`

Lists all configured tools, including their installation method, status, version, and binaries.

- `--json`: Output tool list in JSON format.

#### `dotfiles tool info <tool>`

Displays detailed metadata, dependencies, configuration paths, and on-disk binary locations for a specific tool.

- `--json`: Output tool metadata and locations in JSON format.

#### `dotfiles tool which <name>`

Finds the `.tool.ts` configuration file that configures a tool or binary name. When passed `--bin`, resolves and prints the absolute path of the installed executable binary on disk.

- `--bin`: Output the path to the installed binary executable instead of the configuration file.
- `--json`: Output result in JSON format.

#### `dotfiles tool install [tool...]`

_(Alias: `i`, Root shortcuts: `dotfiles install`, `dotfiles i`)_

Installs the named tools, by tool name or by binary name. With no argument, installs every configured tool, in dependency order.

- `-f, --force`: Force reinstallation even if already installed.
- `--shim-mode`: Quiet output, used by generated shims when they install on first use.

#### `dotfiles tool uninstall [tool...]`

Removes installed tools and their associated binaries, shims, and symlinks. With no argument, uninstalls every configured tool in reverse dependency order.

#### `dotfiles tool update [tool...]`

_(Alias: `u`, Root shortcuts: `dotfiles update`, `dotfiles u`)_

Updates installed tools to their latest available release. With no argument, updates all installed tools. Tools that are not installed are skipped during batch updates.

A tool whose configuration pins a version is not updated, whatever its installation method. A version is pinned when the one its installation asks for is anything other than `"latest"`, and it is named in one of two places:

- `.version()`, which counts as a pin whatever the installation method. `update` reports ``Tool "<tool>" is pinned to version `<version>`. Set version to "latest" in the tool config to enable updates``.
- An install parameter, for the methods that take one: `version` for `github-release`, `gitea-release`, `apt`, `dnf`, `pacman` and `npm`, and `source.version` for `dmg` and `pkg` installed from a GitHub release. The parameter takes precedence over `.version()`, so when both are set it is the parameter that pins the tool, and `update` names it: ``Tool "<tool>" is pinned to version `<version>` by its "<parameter>" install parameter. Set "<parameter>" to "latest" in the tool config to enable updates``.

This holds for named tools, for updating everything, for `<binary> @update` from a shim, and for the dashboard's update action, with or without `--force`. Nothing is checked upstream or installed for the tool, `update` exits successfully, and the dashboard returns the same message as its error. [`tool check`](#dotfiles-tool-check-tool) still reports a newer upstream release for a pinned tool, since reporting installs nothing.

Some installation methods have no way to learn the latest version upstream: `manual`, `curl-binary`, `curl-tar`, `curl-script`, `zsh-plugin`, and `dmg`/`pkg` downloaded from a direct URL rather than a GitHub release. Nothing can tell whether such a tool is current, so `update` never reports it as up to date:

- Named tools (`dotfiles tool update <tool>`, `<binary> @update` from a shim, and the dashboard's update action): warns `Update check not supported for installer "<method>", performing regular install instead` and reinstalls the tool, with or without `--force`.
- Updating everything (no tool names): warns `Update check not supported for installer "<method>"` and skips the tool. With `--force` it is reinstalled like every other installed tool.

Reinstalling such a tool records the version the installer detects, such as through the `versionArgs` of [`curl-script`](../installation-methods/curl-script.md). If the installer detects none, the reinstall records a new `YYYY-MM-DD-HH-MM-SS` timestamp. It never records the version the previous installation left.

A tool installed at a version newer than the latest release upstream, such as a prerelease or a release upstream has since withdrawn, is never moved back to that older release. `update` reports `<installed> is ahead of the latest known version (<latest>)` and leaves the tool alone. With `--force` it reinstalls the installed version, announced as `Force updating: reinstalling installed version <installed>, which is ahead of the latest known version (<latest>)`. To move to the older release, run `dotfiles tool install --force <tool>`, which installs the release the configuration resolves.

A forced reinstall of a tool that had no update finishes with `Successfully reinstalled version <version>`; `Successfully updated to version <version>` is reported only for an update, or for a reinstall of a tool nothing could check.

A tool counts as up to date only when its installation method's query says so. The update check fails when that query fails, prints no version, or cannot tell a current package from a failed lookup. Examples are a registry that cannot be reached, an `apt`, `brew`, `dnf` or `pacman` package that is not installed, or a `github-release` or `gitea-release` tool without a valid `repo`. `dotfiles tool update <tool>` then fails with the query's error, which names the command and either what it printed or the line of its answer that decided. `--force` does not bypass a failed check; `dotfiles tool install --force <tool>` reinstalls a tool without checking upstream.

The dashboard's update action makes the same decisions as `dotfiles tool update <tool>`. A failed check answers with the query's error and installs nothing, and a tool that is not installed is refused. A tool whose check finds no newer release is not reinstalled; it is reported as up to date, or as `<installed> is ahead of the latest known version (<latest>)` when the installed version is newer.

- `-f, --force`: Re-download and reinstall even if already up to date. A failed update check still fails the update.
- `--shim-mode`: Used by generated shims running `<binary> @update`, which print nothing of their own. `update` then reports only what became of the tool: that it is pinned, already up to date, ahead of the latest release, moving to a new release, updated, or reinstalled without an update check. The progress of checking and installing is left out, and errors are reported as always.

#### `dotfiles tool check [tool...]`

Checks available updates from upstream releases without installing.

Each tool is reported with one status:

| Status             | Output                                                                 | Meaning                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update-available` | `<tool>: update available (<installed> -> <latest>)`                   | A newer release counts as an update.                                                                                                                                                                                                                                |
| `up-to-date`       | `<tool>: up to date (<installed>)`                                     | The installed version is the latest, or no newer one counts as an update (the package manager says so, or [`updateCheck.constraint`](../api-reference/core-api.md#updatecheckconfig) excludes it).                                                                  |
| `ahead-of-latest`  | `<tool> (<installed>) is ahead of the latest known version (<latest>)` | The installed version is newer than the latest release upstream. [`tool update`](#dotfiles-tool-update-tool) never replaces it with the older release.                                                                                                              |
| `unsupported`      | `<tool>: update check not supported (<method>)`                        | The installation method cannot check for updates (see [`tool update`](#dotfiles-tool-update-tool)), so nothing was compared.                                                                                                                                        |
| `not-installed`    | `<tool>: not installed (latest: <latest>)`, or `<tool>: not installed` | dotfiles has not installed the tool, so there is nothing to compare. The latest release is named when the installation method can find it without an installation. `brew`, `apt`, `dnf` and `pacman` can only describe an installed package, so they are not asked. |

In agent mode (`AGENT=1`) each tool is one line, `tool:<tool> status:<status> current:<installed> latest:<latest> cached:<true|false>`, or `tool:<tool> status:unsupported current:<installed> installer:<method>`. `current` is empty for a tool that is not installed.

A tool is reported as up to date only when its installation method's query says so. When the query fails, the check fails, whether the tool is installed or not (see [`tool update`](#dotfiles-tool-update-tool)); `tool check` logs `Update check failed` for that tool and leaves it out of its output. A tool whose installation record cannot be read is logged as `Reading the installation record failed` and left out the same way.

- `--json`: Output update status in JSON format. Each entry carries `tool`, `status` (one of the statuses above), `currentVersion`, `latestVersion`, and `cached`. `currentVersion` is absent for a tool that is not installed, and `latestVersion` when nothing upstream named one.

#### `dotfiles tool validate [tool]`

Validates tool configuration files for syntax, schema, or structural errors, then type-checks the TypeScript configuration.

The type-check runs the TypeScript compiler over the CLI-owned `.generated/tsconfig.json` (regenerated first, so the bin-name registry is current) and reports each diagnostic as a validation error attributed to the tool whose `.tool.ts` it is in, with the file, line, and column. The compiler is the `tsc` binary declared by a configured tool -- the scaffolded `typescript.tool.ts` installs `microsoft/typescript-go` pinned to `typescript/v7.0.2` -- and is run from that tool's `current` directory; it is deliberately not exposed on PATH, so it never shadows another project's TypeScript. When no tool declares `tsc`, or the tool is not installed yet, `validate` fails with a message naming `dotfiles tool scaffold` and `dotfiles tool install typescript`; it never skips silently. A JSON-configured project has nothing to type-check, and `--dry-run` skips the step because the generated program is not written to disk; both are announced.

- `--json`: Output validation results in JSON format (type-check diagnostics appear in `errors`).

#### `dotfiles tool files [tool]`

Displays a tree view of files in the tool installation directory or lists all managed files.

- `--json`: Output file tree in JSON format.

#### `dotfiles tool scaffold [name]`

Writes starter `.tool.ts` configuration files into the primary tool configs directory, creating that directory if it does not exist. Loading a configuration never creates tool files; this command is the only thing that does. When a name is provided, generates a single starter `<name>.tool.ts` file.

An existing file is left untouched, so running it again adds what is missing without discarding local edits.

- `-f, --force`: Overwrite tool configurations that already exist.

---

### `dotfiles path`

Queries configured system, target, binary, cache, and storage directories.

With no arguments, `dotfiles path` prints all resolved directories. Specifying a path name (or using `dotfiles path get <name>`) prints that specific directory path.

Supported directory names: `target`, `binaries`, `cache`, `dotfiles`, `generated`, `toolConfigs`, `shellScripts`, `home`.

- `--json`: Output paths in JSON format.

#### `dotfiles path list`

Prints all resolved configuration and runtime directories.

- `--json`: Output directory list in JSON format.

#### `dotfiles path get <name>`

Prints the absolute path of a specific configuration or runtime directory.

- `--json`: Output result in JSON format.

---

### `dotfiles shell`

Interactive shell integration, PATH exports, completion scripts, and collision audits.

#### `dotfiles shell init [shell]`

Emits shell export strings and initialization hooks (similar to `brew shellenv`). Supports `zsh`, `bash`, `powershell`, and `fish`.

#### `dotfiles shell audit`

Detects collisions across aliases, functions, and binaries, and reports every shim `dotfiles state generate` would have to write over a file it did not create. Run it before `dotfiles state generate --overwrite`.

- `--json`: Output conflict analysis in JSON format.

---

### `dotfiles venv`

Manages isolated dotfiles environments -- a directory with its own `dotfiles.config.ts`, `tools/` and `XDG_CONFIG_HOME`, activated by prepending its bin directory to PATH. See [virtual-environments.md](../configuration/virtual-environments.md). It is the dotfiles equivalent of a Python virtual environment, not a Python one.

#### `dotfiles venv list`

Lists detected virtual environments in the current working directory and indicates which environment is currently active.

- `--json`: Output environment list in JSON format.

#### `dotfiles venv create [name]`

Creates an environment directory, named `env` by default.

#### `dotfiles venv delete [name]`

Removes an environment directory. On an interactive terminal it first asks `Delete environment at '<dir>'? [y/N]` and only `y` or `yes` deletes; anything else cancels. Without a terminal to ask on (pipes, CI, `AGENT=1`) it refuses and exits non-zero instead of deleting.

- `-f, --force`: Skip the confirmation prompt. Required when there is no interactive terminal.

---

### `dotfiles state`

System state, drift detection, and orchestration.

#### `dotfiles state generate`

_(Alias: `g`, Root shortcuts: `dotfiles generate`, `dotfiles g`)_

Writes the shims, symlinks, copies, shell initialization scripts and completions the configuration calls for, and removes the artifacts of declarations that have gone.

- `--overwrite`: Replace files that the generator did not create, instead of leaving them in place. See [`shell audit`](#dotfiles-shell-audit) for finding them first.

#### `dotfiles state diff [tool]`

Inspects 3-way differences and drift status between repository declarations, the files currently on disk, and the recorded base state in SQLite.

Reports state across all symlinks, copies, templates, and managed blocks: `in-sync`, `local-drift`, `upstream-update`, `conflict`, `missing`, or `unmanaged`. When differences exist, prints a unified line diff.

- `--json`: Output drift evaluation and diffs in JSON format.

#### `dotfiles state cleanup`

Uninstalls every tool that is recorded as installed but is no longer configured or has been disabled, removing its binaries, shims and symlinks. Artifacts of tools that are still configured are reconciled by `dotfiles state generate`, not here.

#### `dotfiles state log [tool]`

Displays file operations and installation log entries.

- `-n, --tail <N>`: Number of entries to show from the end of the log (default: `50`).
- `--since <YYYY-MM-DD>`: Only show operations recorded on or after that date.
- `--type <kind>`: Filter by file kind (`shim`, `binary`, `symlink`, `copy`, `config`, `completion`, ...).
- `--status`: Show current file states for tools instead of operation history.
- `--json`: Output log entries in JSON format.

---

### `dotfiles dashboard`

Launches the local web dashboard visualization client and server.

- `-p, --port <port>`: Dashboard HTTP port (default: `8080`).
- `-H, --host <address>`: Address to bind to (default: `127.0.0.1`).

#### `dotfiles dashboard start`

Starts the local HTTP dashboard server and prints its URL.

---

### `dotfiles skill [path]`

Lists installed AI skills or extracts the embedded `dotfiles` skill folder into the target directory.

- `--dir <path>`: Custom skills search directory path.
- `--json`: Output skill list in JSON format.

#### `dotfiles skill copy <path>`

Extracts the embedded `dotfiles` skill directory into `<path>/dotfiles`.

---

### `dotfiles self`

CLI binary version and upgrade management.

#### `dotfiles self version`

Prints the CLI version string.

#### `dotfiles self upgrade [version]`

Upgrades or downgrades the `dotfiles` CLI binary from GitHub Releases. With a version argument, moves to exactly that release.

- `--check`: Check for available updates without applying them.
- `-f, --force`: Re-download and reinstall even if already up to date.
- `--prerelease`: Consider prereleases when looking for the latest version.

---

## Global Flags

The following flags are available on all commands:

- `-c, --config <path>`: Path to configuration file (default: `dotfiles.config.ts`).
- `-d, --dry-run`: Simulate operations without modifying the filesystem.
- `--trace`: Enable source location tracing in logs.
- `--log <level>`: Set log level (`verbose`, `default`, `quiet`).
- `--platform <os>`: Override target platform (`macos`, `linux`, `windows`; `darwin` is accepted as a spelling of `macos`). Any other value is rejected.
- `--arch <arch>`: Override target architecture (`amd64`, `arm64`).
- `--libc <libc>`: Override the detected C library (`gnu`, `musl`, `unknown`), which is what [`ctx.systemInfo.libc`](../api-reference/context-api.md#ctxsysteminfo) reports on a Linux target. Off Linux there is no C library to select, so the flag is ignored and `libc` stays `unknown`. Any other value is rejected.
- `-v, --verbose`: Enable verbose logging.
- `-q, --quiet`: Enable quiet logging.
- `--version`: Print the version and exit, like `dotfiles self version`.

`--platform`, `--arch` and `--libc` resolve to one target that governs the whole run: the configuration is loaded for it, `install` selects release assets for it, and every [hook](../api-reference/lifecycle-hooks.md) and function-valued install parameter reports it through [`ctx.systemInfo`](../api-reference/context-api.md#ctxsysteminfo). Each flag that overrides what the machine reports is warned about, because the output of a run carried out for another machine otherwise looks like this machine's.

## Dual-Mode Output (`AGENT=1`)

The CLI automatically adapts its output stream based on the `AGENT` environment variable:

- **Agent Mode (`AGENT=1`)**: Token-conservative output designed for LLMs and automated agents:
  - JSON (`--json`) is minified onto a single line with zero extra whitespace.
  - Directory trees (`dotfiles tool files`) render using compact indented bullets (`* file`).
  - Terminal dividers and decorative whitespace are omitted.
  - Query outputs emit flat key-value pairs, such as the lines of [`tool check`](#dotfiles-tool-check-tool).
  - ANSI colors in diagnostic logs are suppressed.
- **Human Mode (`AGENT=0` or unset)**: Visually polished interactive output:
  - JSON (`--json`) is pretty-printed with 2-space indentation.
  - Directory trees render with box-drawing glyphs (`├─`, `└─`, `│  `).
  - Validation tags use structured tags (`[OK]`, `[WARN]`, `[ERROR]`).

## Shell Completions

`dotfiles state generate` writes the CLI's own zsh completion script, so no tool configuration has to declare it.

- The script is written to `${shellScriptsDir}/zsh/completions/_dotfiles`. `shellScriptsDir` defaults to `${generatedDir}/shell-scripts`, and the generated `main.zsh` adds that `completions` directory to `fpath`.
- Subcommands that take a tool name (`tool install`, `tool update`, `tool uninstall`, `tool which`, `tool files`, `state log`, `tool validate`) complete it from the configured tools; `tool which` also completes configured binary names.
- Reload completions with `autoload -U compinit && compinit` (or restart your shell) after running `dotfiles state generate`.
- `dotfiles completion zsh` still prints the same script for manual use.
