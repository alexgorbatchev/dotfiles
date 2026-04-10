# Common Patterns

Real-world examples for common tool configuration scenarios.

## GitHub Tool with Shell Integration

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "BurntSushi/ripgrep" })
    .bin("rg")
    .zsh((shell) => shell.completions("complete/_rg").aliases({ rg: "ripgrep" }))
    .bash((shell) => shell.completions("complete/rg.bash")),
);
```

## Tool Dependencies

Use `.dependsOn()` when a tool needs other binaries to exist first:

```typescript
// provider.tool.ts
export default defineTool((install) => install("manual", { binaryPath: "./bin/provider" }).bin("provider"));

// consumer.tool.ts
export default defineTool((install) =>
  install("github-release", { repo: "owner/consumer" }).bin("consumer").dependsOn("provider"),
);
```

## Complex Shell Integration

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "junegunn/fzf" })
    .bin("fzf")
    .zsh((shell) =>
      shell.env({ FZF_DEFAULT_OPTS: "--color=fg+:cyan" }).completions("shell/completion.zsh").always(/* zsh */ `
          if [[ -f "${ctx.currentDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.currentDir}/shell/key-bindings.zsh"
          fi
        `),
    ),
);
```

## Cross-Shell Configuration

```typescript
export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.completions("completions/_tool").env({ TOOL_CONFIG: "~/.config/tool" }).aliases({ t: "tool" }),
    )
    .bash((shell) =>
      shell.completions("completions/tool.bash").env({ TOOL_CONFIG: "~/.config/tool" }).aliases({ t: "tool" }),
    ),
);
```

## With Hooks

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .symlink("./config.yml", "~/.config/tool/config.yml")
    .hook("after-install", async ({ installedDir, fileSystem, $ }) => {
      await $`${installedDir}/tool init`;
    }),
);
```

## Platform-Specific Installation

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .platform(Platform.MacOS, (installMac) => installMac("brew", { formula: "tool" }))
    .platform(Platform.Linux, (installLinux) =>
      installLinux("github-release", {
        repo: "owner/tool",
        assetPattern: "*linux*.tar.gz",
      }),
    )
    .platform(Platform.Windows, Architecture.Arm64, (installWin) =>
      installWin("github-release", {
        repo: "owner/tool",
        assetPattern: "*windows-arm64.zip",
      }),
    ),
);
```

## Cargo (Rust) Tool

```typescript
export default defineTool((install) =>
  install("cargo", {
    crateName: "eza",
    githubRepo: "eza-community/eza",
  })
    .bin("eza")
    .zsh((shell) => shell.completions("completions/eza.zsh").aliases({ ls: "eza", ll: "eza -l", la: "eza -la" })),
);
```

## Manual Script

```typescript
export default defineTool((install) =>
  install("manual", { binaryPath: "./scripts/deploy.sh" })
    .bin("deploy")
    .symlink("./deploy.config.yaml", "~/.config/deploy/config.yaml")
    .zsh((shell) =>
      shell.aliases({
        dp: "deploy",
        "deploy-prod": "deploy --env production",
      }),
    ),
);
```

## Configuration-Only (No Binary)

```typescript
export default defineTool((install) =>
  install()
    .symlink("./gitconfig", "~/.gitconfig")
    .zsh((shell) => shell.aliases({ g: "git", gs: "git status", ga: "git add" }).env({ GIT_EDITOR: "nvim" })),
);
```

## Custom Asset Selection

```typescript
export default defineTool((install) =>
  install("github-release", {
    repo: "owner/tool",
    assetSelector: ({ assets, systemInfo }) => {
      const platformMap: Record<string, string> = { darwin: "macos", linux: "linux" };
      const archMap: Record<string, string> = { x64: "amd64", arm64: "arm64" };
      const platform = platformMap[systemInfo.platform];
      const arch = archMap[systemInfo.arch];
      return assets.find((a) => a.name.includes(platform) && a.name.includes(arch) && a.name.endsWith(".tar.gz"));
    },
  }).bin("tool"),
);
```

## Installation Method Quick Reference

| Use Case          | Method           | Example Tools      |
| ----------------- | ---------------- | ------------------ |
| GitHub releases   | `github-release` | fzf, ripgrep, bat  |
| Gitea/Forgejo     | `gitea-release`  | Codeberg tools     |
| Homebrew          | `brew`           | git, jq            |
| Rust crates       | `cargo`          | eza, fd, ripgrep   |
| npm packages      | `npm`            | prettier, eslint   |
| Custom scripts    | `manual`         | deployment scripts |
| Shell config only | `install()`      | aliases, env vars  |
| Installer scripts | `curl-script`    | rustup, nvm        |
| Direct binaries   | `curl-binary`    | single-file tools  |

## Dependency Ordering

# @alexgorbatchev/dotfiles

A modern command-line tool for automated management of developer dotfiles, tool installations, and shell configurations across different systems.

## Why? The Problem It Solves

Traditional dotfiles are often a collection of scattered shell scripts and manual installation steps, leading to:

- **Inconsistent Environments**: Your setup on your work machine drifts from your personal machine.
- **Tedious Manual Setup**: Setting up a new machine takes hours of manual `brew install`, `git clone`, and `cp` commands.
- **Shell-Only Tools**: Tools installed via shell scripts are often not available to GUI applications like VS Code or Raycast.
- **Fragile Scripts**: Shell scripts break easily and are hard to maintain and test.

This project replaces that fragile, manual system with a declarative, programmatic, and automated solution.

## Core Features

- **Declarative Tool Management**: Define every tool, from installation to shell integration, in a typed TypeScript file (`.tool.ts`).
- **Typed Global Configuration**: Author your `dotfiles.config.ts` using a synchronous or asynchronous factory wrapped with `defineConfig` for end-to-end type safety.
- **Automated On-Demand Installation**: Tools are installed automatically the first time you try to run them. No need to pre-install everything.
- **Zero-Overhead Shell Startup**: Your shell's startup time is unaffected. All tool loading is deferred until the moment you actually run a command, adding no latency to your shell's initialization.
- **Global Tool Access**: Automatically generates executable shims, making every tool available system-wide to all applications, not just your interactive shell.
- **Lightweight Usage Tracking**: Shim executions can be counted in SQLite for usage insights with near-zero user-visible overhead.
- **Atomic, Versioned Installs**: Each installation is timestamped, and updates are atomic. Rollbacks are as simple as changing a symlink.
- **Powerful Shell Integration**: Centrally manage aliases, environment variables, shell functions, and completions for Zsh, Bash, and PowerShell.
- **Cross-Platform by Design**: Define platform-specific configurations for macOS, Linux, and Windows within the same file.

## How It Works

1. **Define**: You describe a tool's installation and configuration in a `.tool.ts` file.
2. **Generate**: You run `dotfiles generate`. This creates lightweight executable **shims** for all your defined tools and generates a single shell file to source.
3. **Run & Auto-Install**: The first time you execute a tool's command (e.g., `rg --version`), the shim intercepts the call, triggers the generator to download and install the tool, and then seamlessly executes your command. All subsequent calls are instantaneous. Each execution can also be tracked asynchronously for dashboard usage stats.
4. **Source**: Your `.zshrc` or `.bash_profile` sources one line, and all your tools, aliases, and functions become available everywhere.

## Quick Start

### Bootstrap Install

Use the hosted installer to provision dotfiles in the current directory. It installs the package locally, provisions missing config, installs managed Bun, and runs `dotfiles generate` for you.

```bash
curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash
```

### Manual Install

If you do not want to use the hosted installer, install Bun first and then set up dotfiles manually:

```bash
# Install Bun first: https://bun.sh
dotfiles init

# Install a tool by name
dotfiles install fzf

# Install a tool by binary name (finds tool that provides 'bat')
dotfiles install bat

# Generate shims and shell configuration files
dotfiles generate

# Update all tools to their latest versions
dotfiles update

# View logs of file operations
dotfiles log

# Display tree of installed tool files
dotfiles files <toolName>

# Print the real path to a binary (resolves symlinks)
dotfiles bin <name>

# Create docs symlink in a directory
dotfiles docs <path>
```

### CLI Command Completions

- `dotfiles generate` writes a zsh completion script to `${generatedDir}/shell-scripts/zsh/completions/_dotfiles`.
- Reload completions with `autoload -U compinit && compinit` (or restart your shell) after generating.
- Commands that accept a tool argument (e.g., `install`, `update`, `check-updates`, `files`, `log`, `bin`) now suggest every configured tool name directly in completion menus, so you can pick a target without memorizing identifiers.
- See [Shell & Hooks Reference](.agents/skills/dotfiles/references/shell-and-hooks.md) for shell-specific integration details.

### Configure with TypeScript

Create `dotfiles.config.ts` to take advantage of TypeScript tooling:

```typescript
// dotfiles.config.ts
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(async () => ({
  paths: {
    dotfilesDir: "~/.dotfiles",
    targetDir: "~/.local/bin",
  },
  github: {
    token: process.env.GITHUB_TOKEN,
  },
}));

export const syncExample = defineConfig(() => ({
  paths: {
    generatedDir: "${configFileDir}/.generated",
  },
}));
```

## Example: A Complete Tool Configuration

Define everything about a tool—installation, binary path, config file symlinks, and shell environment—in one place.

```typescript
// configs/tools/ripgrep.tool.ts
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
