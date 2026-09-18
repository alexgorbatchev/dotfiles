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
dotfiles update --all

# Check available updates using installed-state data
dotfiles check-updates --json

# Upgrade dotfiles CLI binary itself
dotfiles upgrade --check
dotfiles upgrade
dotfiles upgrade 2.2.0

# Launch web dashboard
dotfiles dashboard --port 8080

# View file operation logs
dotfiles log fzf --lines 50 -f

# Display tree of installed tool files
dotfiles files fzf

# Print path to binary (or resolve symlinks)
dotfiles bin fzf --resolve

# Clean up cached downloads and stale files
dotfiles cleanup --all

# Manage virtual environments
dotfiles env create myenv --python python3 --pkg requests
dotfiles env delete myenv

# Inspect feature status or detect binary name conflicts
dotfiles features --json
dotfiles detect-conflicts --json

# Manage AI skills or copy embedded skill directory
dotfiles skill .agents/skills/

# Uninstall a tool
dotfiles uninstall fzf
dotfiles uninstall --all

# Print CLI version
dotfiles version
```

## Command Details

### `dotfiles install [tool]`

Installs a tool by tool name or binary name. If no tool is specified, installs all configured tools.

- `--force`: Force reinstallation even if already installed.

### `dotfiles generate`

Generates executable shims, shell initialization scripts, and the catalog (`CATALOG.md`).

### `dotfiles update [tool]`

Updates a specific tool or all tools to their latest versions.

- `--all`: Update all installed tools.

### `dotfiles check-updates`

Checks available updates using recorded installed-state data.

- `--json`: Output update status in JSON format.

### `dotfiles upgrade [version]`

Upgrades or downgrades the `dotfiles` CLI binary from GitHub Releases.

- `--check`: Check for available updates without applying them.

### `dotfiles dashboard`

Launches the web dashboard visualization client and server.

- `-p, --port <port>`: Dashboard HTTP port (default: `8080`).
- `--open`: Automatically open browser (`--open=true` or `--open=false`).

### `dotfiles validate [tool]`

Validates tool configuration files for syntax, schema, or structural errors, then type-checks the TypeScript configuration.

The type-check runs the TypeScript compiler over the CLI-owned `.generated/tsconfig.json` (regenerated first, so the bin-name registry is current) and reports each diagnostic as a validation error attributed to the tool whose `.tool.ts` it is in, with the file, line and column. The compiler is the `tsc` binary declared by a configured tool -- the scaffolded `typescript.tool.ts` installs `microsoft/typescript-go` pinned to `typescript/v7.0.2` -- and is run from that tool's `current` directory; it is deliberately not exposed on PATH, so it never shadows another project's TypeScript. When no tool declares `tsc`, or the tool is not installed yet, `validate` fails with a message naming `dotfiles scaffold` and `dotfiles install`; it never skips silently. A JSON-configured project has nothing to type-check, and `--dry-run` skips the step because the generated program is not written to disk; both are announced.

- `--json`: Output validation results in JSON format (type-check diagnostics appear in `errors`).

### `dotfiles why <tool>`

Finds and prints the path to the `.tool.ts` file responsible for configuring a tool or binary name.

- `--json`: Output details in JSON format.

### `dotfiles files [toolName]`

Lists on-disk files associated with an installed tool.

- `--json`: Output file tree in JSON format.

### `dotfiles log [tool]`

Displays file operations and installation log entries.

- `-n, --lines <N>`: Number of lines to show (default: `20`).
- `-f, --follow`: Stream log output continuously.
- `--json`: Output log entries in JSON format.

### `dotfiles bin [name]`

Outputs target bin directory, lists configured binaries, or resolves a binary path.

- `-l, --list`: List all configured binaries and their associated tool names.
- `--json`: Output binary mapping details in JSON format.

### `dotfiles cleanup`

Cleans up cached download archives, temporary build files, and unreferenced artifacts.

- `--all`: Clean up all cached downloads, unreferenced files, and broken symlinks.

### `dotfiles env`

Virtual environment management commands.

- `dotfiles env create <name>`: Create a python virtual environment.
  - `--python <path>`: Python executable path to use.
  - `--pkg <package>`: Packages to pre-install into the virtual environment.
- `dotfiles env delete <name>`: Remove a virtual environment. On an interactive terminal it first asks `Delete environment at '<dir>'? [y/N]` and only `y` or `yes` deletes; anything else cancels. Without a terminal to ask on (pipes, CI, `AGENT=1`) it refuses and exits non-zero instead of deleting.
  - `--force`: Skip the confirmation prompt. Required when there is no interactive terminal.

### `dotfiles features`

Displays project features, paths, and status.

- `--json`: Output feature details in JSON format.

### `dotfiles detect-conflicts`

Scans configured tools for conflicting binary names.

- `--json`: Output conflict analysis in JSON format.

### `dotfiles config convert`

Converts a TypeScript configuration file (`dotfiles.config.ts`) to JSON format (`dotfiles.config.json`).

- `-i, --input <file>`: Input TypeScript config file (default: `dotfiles.config.ts`).
- `-o, --output <file>`: Output JSON config file (default: `dotfiles.config.json`).

### `dotfiles skill [path]`

Lists installed AI skills or extracts the embedded `dotfiles` skill folder into the target directory.

- `--dir <path>`: Custom skills search directory path.
- `--json`: Output skill list in JSON format.

### `dotfiles uninstall [tool]`

Removes an installed tool and its associated binaries/symlinks.

- `--all`: Uninstall all managed tools.

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
- `--libc <libc>`: Override target C library implementation (`glibc`, `musl`).
- `-v, --verbose`: Enable verbose logging.
- `-q, --quiet`: Enable quiet logging.

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
