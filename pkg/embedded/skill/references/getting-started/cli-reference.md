# CLI Reference

The `dotfiles` CLI provides several commands to manage your tools, generate shims, inspect installations, and launch the web dashboard:

```bash
# Install a tool by name or binary name
dotfiles install fzf
dotfiles install --force fzf

# Generate shims and shell configuration files
dotfiles generate

# Print full path to the .tool.ts config file that installs a tool or binary
dotfiles why fzf

# Validate tool configurations for schema issues or errors
dotfiles validate
dotfiles validate fzf --json

# Update installed tools
dotfiles update fzf
dotfiles update

# Check available updates using installed-state data
dotfiles check-updates --json

# Upgrade dotfiles CLI binary itself
dotfiles upgrade --check
dotfiles upgrade
dotfiles upgrade 2.2.0

# Launch web dashboard
dotfiles dashboard --port 8080

# View file operation logs
dotfiles log fzf --tail 50

# Display tree of installed tool files
dotfiles files fzf

# Print the real path of an installed binary
dotfiles bin fzf

# Remove tools and artifacts that are no longer configured
dotfiles cleanup

# Manage isolated dotfiles environments
dotfiles env create myenv
dotfiles env delete myenv

# Inspect feature flags, or find files a shim would overwrite
dotfiles features --json
dotfiles detect-conflicts --json

# Write the starter tool configurations
dotfiles scaffold

# Manage AI skills or copy embedded skill directory
dotfiles skill .agents/skills/

# Uninstall a tool, or every configured tool
dotfiles uninstall fzf
dotfiles uninstall

# Print CLI version
dotfiles version
```

## Command Details

### `dotfiles install [tool...]`

Installs the named tools, by tool name or by binary name. With no argument, installs
every configured tool, in dependency order.

- `-f, --force`: Force reinstallation even if already installed.
- `--shim-mode`: Quiet output, used by generated shims when they install on first use.

### `dotfiles generate`

Writes the shims, symlinks, copies, shell initialization scripts and completions the
configuration calls for, and removes the artifacts of declarations that have gone.

- `--overwrite`: Replace files that the generator did not create, instead of leaving
  them in place. See [`detect-conflicts`](#dotfiles-detect-conflicts) for finding them
  first.

### `dotfiles update [tool]`

Updates one installed tool, or every installed tool when no name is given. Tools that
are not installed are skipped.

- `-f, --force`: Re-download and reinstall even if already up to date.
- `--shim-mode`: Quiet output, used by generated shims running `<binary> @update`.

### `dotfiles check-updates`

Checks available updates using recorded installed-state data.

- `--json`: Output update status in JSON format.

### `dotfiles upgrade [version]`

Upgrades or downgrades the `dotfiles` CLI binary from GitHub Releases. With a version
argument, moves to exactly that release.

- `--check`: Check for available updates without applying them.
- `-f, --force`: Re-download and reinstall even if already up to date.
- `--prerelease`: Consider prereleases when looking for the latest version.

### `dotfiles dashboard`

Launches the web dashboard visualization client and server.

- `-p, --port <port>`: Dashboard HTTP port (default: `8080`).
- `-H, --host <address>`: Address to bind to (default: `127.0.0.1`).

### `dotfiles validate [tool]`

Validates tool configuration files for syntax, schema, or structural errors, then type-checks the TypeScript configuration.

The type-check runs the TypeScript compiler over the CLI-owned `.generated/tsconfig.json` (regenerated first, so the bin-name registry is current) and reports each diagnostic as a validation error attributed to the tool whose `.tool.ts` it is in, with the file, line and column. The compiler is the `tsc` binary declared by a configured tool -- the scaffolded `typescript.tool.ts` installs `microsoft/typescript-go` pinned to `typescript/v7.0.2` -- and is run from that tool's `current` directory; it is deliberately not exposed on PATH, so it never shadows another project's TypeScript. When no tool declares `tsc`, or the tool is not installed yet, `validate` fails with a message naming `dotfiles scaffold` and `dotfiles install`; it never skips silently. A JSON-configured project has nothing to type-check, and `--dry-run` skips the step because the generated program is not written to disk; both are announced.

- `--json`: Output validation results in JSON format (type-check diagnostics appear in `errors`).

### `dotfiles why <tool>`

Finds and prints the path to the `.tool.ts` file responsible for configuring a tool or binary name.

### `dotfiles files [toolName]`

Lists on-disk files associated with an installed tool.

- `--json`: Output file tree in JSON format.

### `dotfiles log [tool]`

Displays file operations and installation log entries.

- `-n, --tail <N>`: Number of entries to show from the end of the log (default: `50`).
- `--since <YYYY-MM-DD>`: Only show operations recorded on or after that date.
- `--type <kind>`: Filter by file kind (`shim`, `binary`, `symlink`, `copy`, `config`, `completion`, ...).
- `--status`: Show the current file states for tools instead of the operation history.
- `--json`: Output log entries in JSON format.

### `dotfiles bin [name]`

With no argument, prints `paths.targetDir`, the directory the shims live in. With a tool
or binary name, prints the real path of that binary, following the `current` symlink, and
fails if nothing is installed there.

- `-l, --list`: List all configured binaries and their associated tool names.
- `--json`: Output the result in JSON format.

### `dotfiles cleanup`

Uninstalls every tool that is recorded as installed but is no longer configured or has
been disabled, removing its binaries, shims and symlinks. Artifacts of tools that are
still configured are reconciled by `dotfiles generate`, not here. It takes no flags.

### `dotfiles env`

Manages isolated dotfiles environments -- a directory with its own `dotfiles.config.ts`,
`tools/` and `XDG_CONFIG_HOME`, activated by prepending its bin directory to PATH. See
[virtual-environments.md](../configuration/virtual-environments.md). It is the dotfiles
equivalent of a Python virtual environment, not a Python one.

Run on its own, `dotfiles env` prints the `export PATH=...` line that puts the current
project's shim directory first, for `eval`.

- `dotfiles env create [name]`: Create an environment directory, named `env` by default.
  It takes no flags.
- `dotfiles env delete [name]`: Remove an environment. On an interactive terminal it first asks `Delete environment at '<dir>'? [y/N]` and only `y` or `yes` deletes; anything else cancels. Without a terminal to ask on (pipes, CI, `AGENT=1`) it refuses and exits non-zero instead of deleting.
  - `--force`: Skip the confirmation prompt. Required when there is no interactive terminal.

### `dotfiles features [generate-readme]`

With no argument, prints the feature flags of the loaded configuration: whether
`features.shellInstall` is set.

With the `generate-readme` argument, prints a markdown table of every configured tool,
its installation method and its binaries, to standard output.

- `--generate-readme`: The same as passing the `generate-readme` argument.
- `--json`: Output the feature flags in JSON format.

### `dotfiles detect-conflicts`

Reports every shim `dotfiles generate` would have to write over a file it did not
create, naming the tool and the path. Run it before `dotfiles generate --overwrite`.

- `--json`: Output conflict analysis in JSON format.

### `dotfiles scaffold`

Writes the starter `.tool.ts` files a dotfiles repository is expected to have into the
primary tool configs directory, creating that directory if it does not exist. Loading a
configuration never creates tool files; this command is the only thing that does.

An existing file is left untouched, so running it again adds what is missing without
discarding local edits.

- `--force`: Overwrite tool configurations that already exist.

### `dotfiles config convert`

Converts a TypeScript configuration file (`dotfiles.config.ts`) to JSON format (`dotfiles.config.json`).

- `-i, --input <file>`: Input TypeScript config file (default: `dotfiles.config.ts`).
- `-o, --output <file>`: Output JSON config file (default: `dotfiles.config.json`).

### `dotfiles skill [path]`

Lists installed AI skills or extracts the embedded `dotfiles` skill folder into the target directory.

- `--dir <path>`: Custom skills search directory path.
- `--json`: Output skill list in JSON format.

### `dotfiles uninstall [tool]`

Removes an installed tool and its associated binaries, shims and symlinks. With no
argument, uninstalls every configured tool, in reverse dependency order. It takes no
flags.

### `dotfiles version`

Prints the CLI version string.

## Global Flags

The following flags are available on all commands:

- `-c, --config <path>`: Path to configuration file (default: `dotfiles.config.ts`).
- `-d, --dry-run`: Simulate operations without modifying the filesystem.
- `--trace`: Enable source location tracing in logs.
- `--log <level>`: Set log level (`verbose`, `default`, `quiet`).
- `--platform <os>`: Override target platform (`macos`, `linux`, `windows`; `darwin` is accepted as a spelling of `macos`). Any other value is rejected.
- `--arch <arch>`: Override target architecture (`amd64`, `arm64`).
- `--libc <libc>`: Override the detected C library (`gnu`, `musl`, `unknown`), which is what [`ctx.systemInfo.libc`](../api-reference/context-api.md#ctxsysteminfo) reports. Any other value is rejected.
- `-v, --verbose`: Enable verbose logging.
- `-q, --quiet`: Enable quiet logging.
- `--version`: Print the version and exit, like `dotfiles version`.

## Dual-Mode Output (`AGENT=1`)

The CLI automatically adapts its output stream based on the `AGENT` environment variable:

- **Agent Mode (`AGENT=1`)**: Token-conservative output designed for LLMs and automated agents:
  - JSON (`--json`) is minified onto a single line with zero extra whitespace.
  - Directory trees (`dotfiles files`) render using compact indented bullets (`* file`).
  - Terminal dividers and decorative whitespace are omitted.
  - Query outputs emit flat key-value pairs (`tool:bat current:0.24.0 latest:0.25.0 update:true`).
  - ANSI colors in diagnostic logs are suppressed.
- **Human Mode (`AGENT=0` or unset)**: Visually polished interactive output:
  - JSON (`--json`) is pretty-printed with 2-space indentation.
  - Directory trees render with box-drawing glyphs (`├─`, `└─`, `│  `).
  - Validation tags use structured tags (`[OK]`, `[WARN]`, `[ERROR]`).

## Shell Completions

`dotfiles generate` writes the CLI's own zsh completion script, so no tool configuration has to declare it.

- The script is written to `${shellScriptsDir}/zsh/completions/_dotfiles`. `shellScriptsDir` defaults to `${generatedDir}/shell-scripts`, and the generated `main.zsh` adds that `completions` directory to `fpath`.
- Subcommands that take a tool name (`install`, `update`, `uninstall`, `why`, `files`, `log`, `validate`) complete it from the configured tools; `bin` also completes configured binary names.
- Reload completions with `autoload -U compinit && compinit` (or restart your shell) after running `dotfiles generate`.
- `dotfiles completion zsh` still prints the same script for manual use.
