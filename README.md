# @alexgorbatchev/dotfiles

A modern CLI for automated management of local dotfiles, tool installations, and shell configurations across different systems.

## Why? The Problem It Solves

Traditional dotfiles are often a collection of scattered shell scripts and manual installation steps, leading to:

- **Inconsistent Environments**: Your setup on your work machine drifts from your personal machine.
- **Tedious Manual Setup**: Setting up a new machine takes hours of manual `brew install`, `git clone`, and `cp` commands.
- **Shell-Only Tools**: Tools installed via shell scripts are often not available to GUI applications like VS Code or Raycast.
- **No registry**: Most tool managers depend on external registries. While most popular tools are in those registries, majority of other tools are not.
- **Fragile Scripts**: Shell scripts break easily and are hard to maintain and test.

This project replaces that fragile, manual system with a declarative, programmatic, and automated solution.

## Documentation

For complete documentation, guides, and API references, visit **[https://alexgorbatchev.github.io/dotfiles/](https://alexgorbatchev.github.io/dotfiles/)**.

## Example: A Complete Tool Configuration

Define everything about a tool—installation, binary path, config file symlinks, and shell environment—in one place.

```typescript
// ~/.dotfiles/tools/ripgrep.tool.ts
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", {
    repo: "BurntSushi/ripgrep",
  })
    // 1. Define the binary name
    .bin("rg")
    // 2. Declare required binaries that must exist before this tool runs
    .dependsOn("pcre2")
    // 3. Create symlinks for configuration files
    .symlink("./ripgreprc", "~/.ripgreprc")
    // 4. Configure shell-specific integration (aliases, functions, env vars, PATH)
    .zsh((shell) =>
      shell
        // Add custom directories to PATH
        .path((ctx) => `${ctx.installDir}/bin`)
        // Set environment variables (PATH is prohibited here - use .path() instead)
        .env({
          RIPGREP_CONFIG_PATH: "~/.ripgreprc",
        })
        .aliases({
          rgi: "rg -i", // Case-insensitive search alias
        }),
    ),
);
```

## Core Features

- **Automated On-Demand Installation**: Tools are installed automatically the first time you try to run them. No need to pre-install everything.
- **Declarative Tool Management**: Define every tool, from installation to shell integration, in a typed TypeScript file (`.tool.ts`).
- **Zero-Overhead Shell Startup**: Your shell's startup time is unaffected. All tool loading is deferred until the moment you actually run a command, adding no latency to your shell's initialization.
- **Powerful Shell Integration**: Centrally manage aliases, environment variables, shell functions, and completions for Zsh, Bash, and PowerShell.
- **Global Tool Access**: Automatically generates executable shims, making every tool available system-wide to all applications, not just your interactive shell.
- **Lightweight Usage Tracking**: Shim executions can be appended to a local usage log and compacted into SQLite for usage insights with near-zero user-visible overhead (100% local).
- **Atomic, Versioned Installs**: Each installation is timestamped, and updates are atomic. Rollbacks are as simple as changing a symlink.
- **Cross-Platform by Design**: Define platform-specific configurations for macOS, Linux, and Windows within the same file.

## How It Works

1. **Define**: You describe a tool's installation and configuration in a `.tool.ts` file.
2. **Generate**: You run `dotfiles generate`. This creates lightweight executable **shims** for all your defined tools and generates a single shell file to source.
3. **Run & Auto-Install**: The first time you execute a tool's command (e.g., `rg --version`), the shim intercepts the call, triggers the generator to download and install the tool, and then seamlessly executes your command. All subsequent calls are instantaneous. Each execution can also be appended to a local usage log, which the dashboard compacts into SQLite on startup.
4. **Source**: Your `.zshrc` sources one line, and all your tools, aliases, and functions become available everywhere.

## Quick Start

### Bootstrap Install

Use the hosted installer to provision dotfiles in the current directory. It installs the package locally, provisions missing config, installs managed Bun, and runs `dotfiles generate` for you.

```bash
curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash
```

### Manual Install

#### Bun runtime requirement

The published npm package installs JavaScript files, but the `dotfiles` CLI entrypoint is executed with `#!/usr/bin/env bun`. Bun must be installed and available on `PATH` before you run the public package.

If you do not want to use the hosted installer, install Bun first and then set up dotfiles manually:

```bash
# Install Bun first: https://bun.sh
$ bun install -D @alexgorbatchev/dotfiles
$ bun run dotfiles init

# Install `dotfiles` skill
$ dotfiles skill .agents/skills/
```

### Making First `.tool.ts` file

The fastest way to make `.tool.ts` files is to ask an agent. For example:

> /skills:dotfiles https://github.com/junegunn/fzf

This should produce `fzf.tool.ts`. After you generate and source the zsh config below, you should be able to run `fzf` from your current shell without restarting it.

```bash
# Generate shims and shell configuration files
$ dotfiles generate
```

If you are using the default project layout, add the generated zsh config to `~/.zshrc`:

```bash
source "/absolute/path/to/your/dotfiles/.generated/shell-scripts/main.zsh"
```

Then reload zsh:

```bash
source ~/.zshrc
```
