# Installation Methods

## Table of Contents

- [Overview](#overview)
  - [Available Methods](#available-methods)
  - [Choosing the Right Method](#choosing-the-right-method)
  - [Manual Installation Guide](#manual-installation-guide)
  - [Common Parameters](#common-parameters)
- [GitHub Release Installation](#github-release-installation)
  - [Parameters](#parameters)
  - [Asset Pattern Matching](#asset-pattern-matching)
  - [Platform Detection](#platform-detection)
- [Gitea/Forgejo Release Installation](#giteaforgejo-release-installation)
  - [Parameters](#parameters-1)
  - [Supported Instances](#supported-instances)
- [Homebrew Installation](#homebrew-installation)
  - [Parameters](#parameters-2)
  - [Platform Support](#platform-support)
- [Cargo Installation](#cargo-installation)
  - [Parameters](#parameters-3)
  - [Asset Pattern Placeholders](#asset-pattern-placeholders)
  - [Platform Mapping](#platform-mapping)
- [npm Installation](#npm-installation)
  - [Parameters](#parameters-4)
  - [How It Works](#how-it-works)
- [Curl Script Installation](#curl-script-installation)
  - [Parameters](#parameters-5)
  - [Understanding stagingDir](#understanding-stagingdir)
- [Curl Tar Installation](#curl-tar-installation)
  - [Parameters](#parameters-6)
  - [Supported Formats](#supported-formats)
- [Curl Binary Installation](#curl-binary-installation)
  - [Parameters](#parameters-7)
- [DMG Installation](#dmg-installation)
  - [Parameters](#parameters-8)
  - [Platform Behavior](#platform-behavior)
- [Manual Installation](#manual-installation)
  - [Parameters](#parameters-9)
- [Zsh Plugin Installation](#zsh-plugin-installation)
  - [Parameters](#parameters-10)
  - [Auto-Install Behavior](#auto-install-behavior)
  - [How It Works](#how-it-works-1)
  - [Auto-detected Source Files](#auto-detected-source-files)

---

# Overview

The system supports multiple installation methods to accommodate different tool distribution patterns. Each method has its own parameters and use cases.

## Available Methods

### GitHub Release

Install tools from GitHub releases with automatic asset selection and extraction.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository',
  }).bin('tool')
);
```

### Gitea/Forgejo Release

Install tools from Gitea, Forgejo, or Codeberg releases with automatic asset selection.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('gitea-release', {
    instanceUrl: 'https://codeberg.org',
    repo: 'owner/repository',
  }).bin('tool')
);
```

### Homebrew

Install tools using Homebrew package manager (macOS and Linux).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'ripgrep',
  }).bin('rg')
);
```

### Cargo

Install Rust tools from crates.io with cargo-quickinstall for faster downloads.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).bin('rg')
);
```

### npm

Install tools published as npm packages.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('npm', {
    package: 'prettier',
  }).bin('prettier')
);
```

### Curl Script

Download and execute installation scripts.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  }).bin('bun')
);
```

### Curl Tar

Download and extract tarballs directly from URLs.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-tar', {
    url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  }).bin('tool')
);
```

### Curl Binary

Download standalone binary files directly from URLs (no archive extraction).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-binary', {
    url: 'https://example.com/tool-v1.0.0-linux-amd64',
  }).bin('tool')
);
```

### DMG

Install macOS applications from DMG disk images (silently skipped on other platforms).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
  }).bin('myapp')
);
```

### Manual

Install files from your dotfiles directory (custom scripts, pre-built binaries) or configuration-only tools. Can be called without params: `install('manual')`.

```typescript
import { defineTool } from '@gitea/dotfiles';

// With binary installation
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './bin/my-script.sh',
  }).bin('my-script')
);

// Without params (shell-only or dependency wrapper)
export default defineTool((install) =>
  install('manual')
    .bin('tokscale')
    .dependsOn('bun')
    .zsh((shell) =>
      shell.functions({
        tokscale: `bun x tokscale@latest`,
      })
    )
);

// Configuration-only
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: 'ls -la' })));
```

### Zsh Plugin

Clone Git repositories for zsh plugins.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) => shell.always(`source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"`))
);
```

## Choosing the Right Method

| Method             | Best For                            | Pros                                   | Cons                                 |
| ------------------ | ----------------------------------- | -------------------------------------- | ------------------------------------ |
| **GitHub Release** | Most open source tools              | Automatic updates, cross-platform      | Requires GitHub hosting              |
| **Gitea/Forgejo**  | Codeberg / self-hosted Gitea tools  | Supports any Gitea-compatible host     | Requires instance URL                |
| **Homebrew**       | macOS/Linux tools                   | Simple, well-maintained                | Platform-specific, requires Homebrew |
| **Cargo**          | Rust tools                          | Fast pre-compiled binaries             | Rust tools only                      |
| **npm**            | Node.js tools                       | Simple, version management             | Requires Node.js/npm                 |
| **Curl Script**    | Custom installers                   | Flexible, handles complex setups       | Less predictable, security concerns  |
| **Curl Tar**       | Archive downloads                   | Simple, no dependencies                | Manual URL management                |
| **Curl Binary**    | Direct binary downloads             | Simplest, no extraction needed         | Manual URL management                |
| **DMG**            | macOS .app bundles                  | Handles mount/unmount, archive extract | macOS only                           |
| **Manual**         | Custom scripts, configuration tools | Include files with dotfiles, flexible  | Manual file management               |
| **Zsh Plugin**     | Zsh plugins from Git repos          | Simple, automatic updates              | Zsh plugins only                     |

## Manual Installation Guide

The `manual` method is the unified approach for binary installation from your dotfiles directory.

### Use **Manual** for Binary Installation:

- You have custom scripts or binaries to include with your dotfiles
- You want the system to manage and version your tool files
- You need shims generated for your custom tools
- You want to distribute pre-built binaries with your dotfiles

**Example:** Including a custom deployment script with your dotfiles.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',
  }).bin('deploy')
);
```

### Use `install()` for Configuration Only:

- You only need shell configuration (aliases, environment, symlinks)
- Tools are managed entirely outside the dotfiles system
- You don't want any binary installation or management
- Creating configuration-only "tools"

**Example:** Setting up shell aliases and environment variables.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install().zsh((shell) =>
    shell
      .aliases({
        ll: 'ls -la',
      })
      .env({
        EDITOR: 'vim',
      })
  )
);
```

## Common Parameters

Most installation methods support these common concepts:

- **Version Selection**: Specify exact versions or use constraints
- **Platform Detection**: Automatic selection of appropriate binaries
- **Binary Path**: Specify which file is the main executable
- **Asset Selection**: Choose the right download for your platform
- **Environment Variables**: Set `env` for installation (static or dynamic)

### Environment Variables (`env`)

All installation methods support an `env` parameter for setting environment variables during installation:

```typescript
// Static environment variables
install('github-release', {
  repo: 'owner/tool',
  env: { CUSTOM_FLAG: 'true' },
}).bin('tool');

// Dynamic environment variables
install('curl-script', {
  url: 'https://example.com/install.sh',
  shell: 'bash',
  env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
}).bin('tool');
```

Dynamic `env` functions receive a context with:

- `projectConfig` - Full project configuration
- `stagingDir` - Temporary installation directory

For `curl-script`, the context also includes `scriptPath`.

---

# GitHub Release Installation

Download and install tools from GitHub releases with automatic platform asset selection.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) => install('github-release', { repo: 'junegunn/fzf' }).bin('fzf'));
```

## Parameters

| Parameter       | Description                                               |
| --------------- | --------------------------------------------------------- |
| `repo`          | **Required**. GitHub repository in "owner/repo" format    |
| `assetPattern`  | Glob pattern to match release assets                      |
| `assetSelector` | Custom function to select the correct asset               |
| `version`       | Specific version (e.g., `'v1.2.3'`)                       |
| `prerelease`    | Include prereleases when fetching latest (default: false) |
| `githubHost`    | Custom GitHub API host for Enterprise                     |
| `ghCli`         | Use `gh` CLI for API requests instead of fetch            |
| `env`           | Environment variables (static or dynamic function)        |

## Examples

### With Asset Pattern

```typescript
install('github-release', {
  repo: 'sharkdp/bat',
  assetPattern: '*linux_amd64.tar.gz',
}).bin('bat');
```

### Custom Asset Selector

```typescript
install('github-release', {
  repo: 'example/tool',
  assetSelector: ({ assets, systemInfo }) => {
    const platform = systemInfo.platform === 'darwin' ? 'macos' : systemInfo.platform;
    return assets.find((a) => a.name.includes(platform));
  },
}).bin('tool');
```

### Specific Version

```typescript
install('github-release', {
  repo: 'owner/tool',
  version: 'v2.1.0',
}).bin('tool');
```

### Using gh CLI

Use the `gh` CLI for API requests instead of fetch. Useful when working behind proxies or leveraging existing `gh` authentication:

```typescript
install('github-release', {
  repo: 'owner/tool',
  ghCli: true,
}).bin('tool');
```

### Including Prereleases

By default, GitHub's "latest" excludes prereleases. Use `prerelease: true` for repos that only publish prerelease versions:

```typescript
install('github-release', {
  repo: 'owner/nightly-only-tool',
  prerelease: true,
}).bin('tool');
```

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)

## Platform Detection

Available in `assetSelector` as `systemInfo`:

| Property   | Values                     |
| ---------- | -------------------------- |
| `platform` | `darwin`, `linux`, `win32` |
| `arch`     | `x64`, `arm64`             |

---

# Gitea/Forgejo Release Installation

Download and install tools from Gitea or Forgejo instance releases with automatic platform asset selection. Supports any Gitea-compatible instance including Codeberg, Forgejo, and self-hosted Gitea.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('gitea-release', {
    instanceUrl: 'https://codeberg.org',
    repo: 'Codeberg/pages-server',
  }).bin('pages-server')
);
```

## Parameters

| Parameter       | Description                                               |
| --------------- | --------------------------------------------------------- |
| `instanceUrl`   | **Required**. Base URL of the Gitea/Forgejo instance      |
| `repo`          | **Required**. Repository in "owner/repo" format           |
| `assetPattern`  | Glob or regex pattern to match release assets             |
| `assetSelector` | Custom function to select the correct asset               |
| `version`       | Specific version (e.g., `'v1.2.3'`)                       |
| `prerelease`    | Include prereleases when fetching latest (default: false) |
| `token`         | API token for authentication with the instance            |
| `env`           | Environment variables (static or dynamic function)        |

## Examples

### With Asset Pattern

```typescript
install('gitea-release', {
  instanceUrl: 'https://codeberg.org',
  repo: 'owner/tool',
  assetPattern: '*linux_amd64.tar.gz',
}).bin('tool');
```

### Custom Asset Selector

```typescript
install('gitea-release', {
  instanceUrl: 'https://codeberg.org',
  repo: 'owner/tool',
  assetSelector: ({ assets, systemInfo }) => {
    const platform = systemInfo.platform === 'darwin' ? 'macos' : systemInfo.platform;
    return assets.find((a) => a.name.includes(platform));
  },
}).bin('tool');
```

### Specific Version

```typescript
install('gitea-release', {
  instanceUrl: 'https://codeberg.org',
  repo: 'owner/tool',
  version: 'v2.1.0',
}).bin('tool');
```

### With Authentication Token

For private repositories or to avoid rate limits:

```typescript
install('gitea-release', {
  instanceUrl: 'https://gitea.example.com',
  repo: 'org/private-tool',
  token: process.env.GITEA_TOKEN,
}).bin('tool');
```

## Asset Pattern Matching

| Pattern                | Matches             |
| ---------------------- | ------------------- |
| `*linux*amd64*.tar.gz` | Linux x64 tarballs  |
| `*darwin*arm64*.zip`   | macOS ARM64 zips    |
| `*windows*.exe`        | Windows executables |

Glob syntax: `*` (any chars), `?` (single char), `[abc]` (char class), `{a,b}` (alternation)

Regex patterns can also be used by wrapping in forward slashes: `/tool-v\d+.*linux/`

## Platform Detection

Available in `assetSelector` as `systemInfo`:

| Property   | Values                     |
| ---------- | -------------------------- |
| `platform` | `darwin`, `linux`, `win32` |
| `arch`     | `x64`, `arm64`             |

## Supported Instances

Any server running the Gitea API v1 is supported:

- Codeberg — Free hosting for open source projects
- Forgejo — Community fork of Gitea
- Gitea — Self-hosted Git service
- Self-hosted instances

---

# Homebrew Installation

Install tools using Homebrew package manager on macOS and Linux.

Shims are not supported for Homebrew-installed tools. The `.bin()` method should not be used with this installer. Homebrew manages binary placement and PATH integration natively.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) => install('brew', { formula: 'ripgrep' }));
```

## Parameters

| Parameter      | Description                                         |
| -------------- | --------------------------------------------------- |
| `formula`      | Formula or cask name (defaults to tool name)        |
| `cask`         | Set `true` for cask installation                    |
| `tap`          | Tap(s) to add before installing                     |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`) |
| `versionRegex` | Regex to extract version from output                |
| `env`          | Environment variables (static or dynamic function)  |

## Examples

### Homebrew Cask

```typescript
install('brew', {
  formula: 'visual-studio-code',
  cask: true,
});
```

### With Custom Tap

```typescript
install('brew', {
  formula: 'aerospace',
  cask: true,
  tap: 'nikitabobko/tap',
});
```

### Multiple Taps

```typescript
install('brew', {
  formula: 'custom-tool',
  tap: ['custom/tap', 'another/tap'],
});
```

## Platform Support

| Platform | Support                 |
| -------- | ----------------------- |
| macOS    | Full (formulas + casks) |
| Linux    | Formulas only           |
| Windows  | Not supported           |

---

# Cargo Installation

Installs Rust tools from crates.io using pre-compiled binaries via cargo-quickinstall or GitHub releases.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).bin('rg')
);
```

## Parameters

| Parameter        | Type                                               | Required | Description                                            |
| ---------------- | -------------------------------------------------- | -------- | ------------------------------------------------------ |
| `crateName`      | `string`                                           | Yes      | Name of the Rust crate                                 |
| `binarySource`   | `'cargo-quickinstall' \| 'github-releases'`        | No       | Binary download source (default: `cargo-quickinstall`) |
| `versionSource`  | `'cargo-toml' \| 'crates-io' \| 'github-releases'` | No       | Version detection source (default: `cargo-toml`)       |
| `githubRepo`     | `string`                                           | No       | GitHub repo in `owner/repo` format                     |
| `assetPattern`   | `string`                                           | No       | Pattern for GitHub release assets                      |
| `cargoTomlUrl`   | `string`                                           | No       | Custom Cargo.toml URL                                  |
| `customBinaries` | `string[]`                                         | No       | Custom binary names if different from crate            |
| `env`            | `Record<string, string> \| (ctx) => Record<...>`   | No       | Environment variables (static or dynamic function)     |

### Asset Pattern Placeholders

| Placeholder   | Description          |
| ------------- | -------------------- |
| `{version}`   | Resolved version     |
| `{platform}`  | Current platform     |
| `{arch}`      | Current architecture |
| `{crateName}` | Crate name           |

## Examples

### From GitHub Releases

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'bat',
    binarySource: 'github-releases',
    githubRepo: 'sharkdp/bat',
    assetPattern: 'bat-v{version}-{arch}-{platform}.tar.gz',
  }).bin('bat')
);
```

### Custom Binary Names

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'fd-find',
    customBinaries: ['fd'],
  }).bin('fd')
);
```

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'tool',
  })
    .bin('tool')
    .hook('after-install', async (ctx) => {
      // Post-installation setup
    })
);
```

## Platform Mapping

| System | Architecture | Rust Target Triple          |
| ------ | ------------ | --------------------------- |
| macOS  | arm64        | `aarch64-apple-darwin`      |
| macOS  | x64          | `x86_64-apple-darwin`       |
| Linux  | x64          | `x86_64-unknown-linux-gnu`  |
| Linux  | arm64        | `aarch64-unknown-linux-gnu` |

---

# npm Installation

Install tools published as npm packages. Supports both `npm` and `bun` as package managers.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) => install('npm', { package: 'prettier' }).bin('prettier'));
```

## Parameters

| Parameter        | Type                                             | Required | Description                                                  |
| ---------------- | ------------------------------------------------ | -------- | ------------------------------------------------------------ |
| `package`        | `string`                                         | No       | npm package name (defaults to tool name)                     |
| `version`        | `string`                                         | No       | Version or version range (e.g., `3.0.0`, defaults to latest) |
| `packageManager` | `'npm' \| 'bun'`                                 | No       | Package manager to use for installation (defaults to `'npm'`) |
| `versionArgs`    | `string[]`                                       | No       | Arguments for version check (e.g., `['--version']`)          |
| `versionRegex`   | `string`                                         | No       | Regex to extract version from output                         |
| `env`            | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic function)           |

## Examples

### Specific Version

```typescript
export default defineTool((install) =>
  install('npm', {
    package: 'prettier',
    version: '3.0.0',
  }).bin('prettier')
);
```

### Using Bun

```typescript
export default defineTool((install) =>
  install('npm', {
    package: 'prettier',
    packageManager: 'bun',
  }).bin('prettier')
);
```

### Scoped Package

```typescript
export default defineTool((install) =>
  install('npm', {
    package: '@angular/cli',
  }).bin('ng')
);
```

### Custom Version Detection

```typescript
export default defineTool((install) =>
  install('npm', {
    package: 'typescript',
    versionArgs: ['--version'],
    versionRegex: '(\\d+\\.\\d+\\.\\d+)',
  }).bin('tsc')
);
```

## How It Works

1. **Install**: Runs `npm install --prefix <stagingDir> <package>[@version]` (or `bun add --cwd <stagingDir> <package>[@version]` when `packageManager: 'bun'`)
2. **Binaries**: Resolved from `node_modules/.bin/` in the install directory
3. **Version**: Detected via `npm ls --json` (npm), `node_modules/<package>/package.json` (bun), or custom `versionArgs`/`versionRegex`
4. **Updates**: Checked via `npm view <package> version` (regardless of package manager)

---

# Curl Script Installation

Downloads and executes shell installation scripts.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  }).bin('bun')
);
```

## Parameters

| Parameter      | Type                                             | Required | Description                               |
| -------------- | ------------------------------------------------ | -------- | ----------------------------------------- |
| `url`          | `string`                                         | Yes      | URL of the installation script            |
| `shell`        | `'bash' \| 'sh'`                                 | Yes      | Shell interpreter to use                  |
| `args`         | `string[] \| (ctx) => string[]`                  | No       | Arguments to pass to the script           |
| `env`          | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic) |
| `versionArgs`  | `string[]`                                       | No       | Args to pass to binary for version check  |
| `versionRegex` | `string`                                         | No       | Regex to extract version from output      |

> **Note:** The `env` and `args` parameters support both static values and dynamic functions. Dynamic functions receive a context with `projectConfig`, `scriptPath`, and `stagingDir`.

## Understanding `stagingDir`

When the curl-script installer runs, it creates a temporary **staging directory** where the installation takes place. This is critical to understand because:

1. **The system expects binaries in `stagingDir`** - After your installation script completes, the tool installer looks for the declared binaries (from `.bin()`) inside `stagingDir`. If they are not there, installation fails.

2. **`stagingDir` becomes the versioned directory** - After successful installation, the entire staging directory is renamed to the final versioned path (e.g., `~/.dotfiles/tools/fnm/1.2.3`). All files in `stagingDir` are preserved.

3. **Most scripts need to be redirected** - By default, installation scripts install to their own preferred locations (like `~/.local/bin` or `~/.<tool>`). You must redirect them to `stagingDir` using the script's configuration options.

### How to Redirect Installation

Check the installation script's source to find the right argument or environment variable:

```bash
# Download and inspect the script
curl -fsSL https://fly.io/install.sh | less

# Look for variables like:
# INSTALL_DIR, PREFIX, BIN_DIR, FLYCTL_INSTALL, etc.
```

Then use `args` or `env` with the dynamic context to redirect:

```typescript
// Using args (if script accepts command-line arguments)
args: ((ctx) => ['--install-dir', ctx.stagingDir]);

// Using env (if script reads environment variables)
env: ((ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }));
```

## Examples

### With Static Arguments

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: ['--skip-shell', '--install-dir', '$LOCAL_BIN'],
  }).bin('fnm')
);
```

### With Dynamic Arguments

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fnm.vercel.app/install',
    shell: 'bash',
    args: (argsCtx) => ['--install-dir', argsCtx.stagingDir],
  }).bin('fnm')
);
```

The `args` function receives a context with:

- `projectConfig` - Project configuration with paths and settings
- `scriptPath` - Absolute path to the downloaded script (in `stagingDir`, already chmod +x)
- `stagingDir` - Temporary directory for this installation attempt. The script is downloaded here, along with any files your code creates. After successful installation, the entire directory is renamed to the versioned path (e.g., `<tool-name>/1.2.3`), preserving all contents.

### With Environment Variables

Use dynamic `env` to redirect installation to `stagingDir`:

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
    env: (ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }),
  }).bin('flyctl', 'fly')
);
```

Note: The fly.io script installs `flyctl` as the main binary. The second argument to `.bin()` creates `fly` as a symlink alias.

The `env` context provides:

- `projectConfig` - Project configuration with paths and settings
- `stagingDir` - Temporary directory for installation (becomes versioned path after success)
- `scriptPath` - Absolute path to the downloaded script (curl-script specific)

### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .bin('tool')
    .hook('after-download', async (ctx) => {
      // Verify script before execution
    })
);
```

**Security Note**: Curl scripts execute arbitrary code. Only use trusted sources with HTTPS URLs.

---

# Curl Tar Installation

Download and extract tarballs directly from URLs.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
  }).bin('tool')
);
```

## Parameters

| Parameter         | Description                                         |
| ----------------- | --------------------------------------------------- |
| `url`             | **Required**. Direct URL to the tarball             |
| `extractPath`     | Path to binary within extracted archive             |
| `stripComponents` | Directory levels to strip during extraction         |
| `versionArgs`     | Arguments for version check (e.g., `['--version']`) |
| `versionRegex`    | Regex to extract version from output                |
| `env`             | Environment variables (static or dynamic function)  |

## Examples

### Binary in Subdirectory

```typescript
install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
}).bin('tool', 'bin/tool'); // Binary at bin/tool in archive
```

### With Shell Configuration

```typescript
install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
})
  .bin('tool')
  .zsh((shell) => shell.aliases({ t: 'tool' }));
```

## Supported Formats

`.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tar.xz`, `.txz`, `.tar`

## When to Use

- Direct tarball downloads from known URLs
- Tools without GitHub releases
- Simple archive structures

Prefer `github-release` when GitHub releases are available.

---

# Curl Binary Installation

Download standalone binary files directly from URLs. Unlike `curl-tar`, this method does **not** extract an archive — the downloaded file is the binary itself.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('curl-binary', {
    url: 'https://example.com/tool-v1.0.0-linux-amd64',
  }).bin('tool')
);
```

## Parameters

| Parameter      | Description                                         |
| -------------- | --------------------------------------------------- |
| `url`          | **Required**. Direct URL to the binary file         |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`) |
| `versionRegex` | Regex to extract version from output                |
| `env`          | Environment variables (static or dynamic function)  |

## Examples

### With Version Detection

```typescript
install('curl-binary', {
  url: 'https://example.com/tool-v1.0.0-linux-amd64',
  versionArgs: ['--version'],
  versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
}).bin('tool');
```

### With Shell Configuration

```typescript
install('curl-binary', {
  url: 'https://example.com/tool-v1.0.0-linux-amd64',
})
  .bin('tool')
  .zsh((shell) => shell.aliases({ t: 'tool' }));
```

### Platform-Specific URLs

```typescript
import { Architecture, defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install()
    .bin('tool')
    .platform(Platform.MacOS, Architecture.Arm64, (install) =>
      install('curl-binary', {
        url: 'https://example.com/tool-darwin-arm64',
      }))
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install('curl-binary', {
        url: 'https://example.com/tool-linux-amd64',
      }))
);
```

## When to Use

- Direct binary file downloads (single executable, no archive)
- Tools that distribute platform-specific binaries as standalone files
- Single-file Go or Rust binaries provided as direct downloads

Prefer `github-release` when GitHub releases are available. Prefer `curl-tar` when the download is an archive.

---

# DMG Installation

Install macOS applications distributed as DMG disk images. The plugin mounts the DMG, copies the `.app` bundle to the staging directory. Silently skipped on non-macOS platforms.

If the URL points to a supported archive (`.zip`, `.tar.gz`, etc.) containing a `.dmg` file, the archive is automatically extracted first. This is common for GitHub releases that compress DMGs into zip files.

Shims are not supported for DMG-installed applications. The `.bin()` method should not be used with this installer.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
  })
);
```

## Parameters

| Parameter      | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| `url`          | **Required**. URL of the DMG file or archive containing a DMG                  |
| `appName`      | Name of the `.app` bundle (e.g., `'MyApp.app'`). Auto-detected if omitted      |
| `binaryPath`   | Relative path to binary inside `.app`. Defaults to `Contents/MacOS/{bin name}` |
| `versionArgs`  | Arguments for version check (e.g., `['--version']`)                            |
| `versionRegex` | Regex to extract version from output                                           |
| `env`          | Environment variables (static or dynamic function)                             |

## Examples

### Explicit App Name

```typescript
install('dmg', {
  url: 'https://example.com/MyApp-1.0.0.dmg',
  appName: 'MyApp.app',
}).version('1.0.0');
```

### From Archive Containing DMG

```typescript
install('dmg', {
  url: 'https://github.com/example/app/releases/download/v1.0.0/MyApp.dmg.zip',
});
```

### With Version Detection

```typescript
install('dmg', {
  url: 'https://example.com/MyApp-1.0.0.dmg',
  versionArgs: ['--version'],
  versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
});
```

## Platform Behavior

| Platform | Behavior                                  |
| -------- | ----------------------------------------- |
| macOS    | Full installation via hdiutil             |
| Linux    | Silently skipped (returns empty binaries) |
| Windows  | Silently skipped (returns empty binaries) |

No `.platform()` wrapper is needed — the plugin handles platform detection internally.

## When to Use

- macOS applications distributed as `.dmg` disk images
- Tools that ship as `.app` bundles
- GitHub releases that distribute `.dmg` files inside `.zip` or `.tar.gz` archives

Prefer `brew` when the tool is available as a Homebrew formula or cask. Prefer `curl-binary` or `github-release` for cross-platform tools.

---

# Manual Installation

Installs files from your tool configuration directory (custom scripts, pre-built binaries) or registers configuration-only tools. The `manual` method can be called with or without params.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

// Install a custom script
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/my-tool.sh',
  }).bin('my-tool')
);

// Without params (shell-only or dependency wrapper)
export default defineTool((install) =>
  install('manual')
    .bin('tokscale')
    .dependsOn('bun')
    .zsh((shell) =>
      shell.functions({
        tokscale: `bun x tokscale@latest`,
      })
    )
);

// Configuration-only tool (no binary)
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: 'ls -la' })));
```

## Parameters

| Parameter    | Type                                             | Required | Description                                        |
| ------------ | ------------------------------------------------ | -------- | -------------------------------------------------- |
| `binaryPath` | `string`                                         | No       | Path to binary relative to `.tool.ts` file         |
| `env`        | `Record<string, string> \| (ctx) => Record<...>` | No       | Environment variables (static or dynamic function) |

## Examples

### Pre-built Binary

```typescript
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './binaries/linux/x64/custom-tool',
  }).bin('custom-tool')
);
```

### Configuration-Only Tool

```typescript
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: 'ls -la', la: 'ls -A' })));
```

### With Shell Configuration

```typescript
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './bin/my-tool.sh',
  })
    .bin('my-tool')
    .zsh((shell) => shell.aliases({ mt: 'my-tool' }).completions('./completions/_my-tool'))
);
```

**Notes:**

- Binary paths are relative to the tool configuration file location
- Files are copied to the managed installation directory with executable permissions
- Configuration-only tools use `install()` with no arguments and must not define `.bin()`

---

# Zsh Plugin Installation

The `zsh-plugin` installation method clones Git repositories for zsh plugins and automatically configures them to be sourced in your shell. This is useful for installing plugins that are not available via package managers.

## Configuration

### Basic Usage

#### GitHub Shorthand

The simplest way to install a plugin from GitHub:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
);
```

The plugin is automatically sourced - no additional configuration needed!

#### Full Git URL

For plugins hosted elsewhere (GitLab, Bitbucket, private repos):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    url: 'https://gitlab.com/user/custom-plugin.git',
  })
);
```

### Install Parameters

| Parameter    | Type    | Required | Description                                                |
| ------------ | ------- | -------- | ---------------------------------------------------------- |
| `repo`       | string  | No\*     | GitHub repository shorthand (e.g., `user/repo`)            |
| `url`        | string  | No\*     | Full Git URL (e.g., `https://github.com/user/repo.git`)    |
| `pluginName` | string  | No       | Custom plugin directory name (defaults to repository name) |
| `source`     | string  | No       | Explicit source file path (auto-detected if not specified) |
| `auto`       | boolean | No       | Auto-install during `generate` command (default: `true`)   |

\* Either `repo` or `url` must be provided.

### Auto-Install Behavior

By default (`auto: true`), zsh plugins are automatically installed during the `dotfiles generate` command. This means:

1. When you run `dotfiles generate`, plugins with `auto: true` are cloned/updated
2. The plugin's `source` command is automatically added to your shell init
3. No separate `dotfiles install` step is needed for these plugins

To disable auto-installation and require explicit `dotfiles install`:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    auto: false, // Requires explicit `dotfiles install`
  })
);
```

### Custom Plugin Name

Use `pluginName` when you want the plugin directory name to differ from the repository name:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    pluginName: 'vi-mode', // Cloned to plugins/vi-mode instead of plugins/zsh-vi-mode
  })
);
```

### Explicit Source File

If the plugin's source file doesn't follow standard naming conventions, specify it explicitly:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'some-org/some-plugin',
    source: 'custom-init.zsh', // Use this file instead of auto-detection
  })
);
```

## How It Works

1. **Clone**: The repository is cloned with `--depth 1` to minimize download size
2. **Detect**: The plugin's source file is auto-detected (e.g., `*.plugin.zsh`)
3. **Source**: A `source` command is automatically added to your shell init
4. **Update**: On subsequent runs, `git pull --ff-only` updates the plugin
5. **Version**: Version is determined from git tags (e.g., `v0.1.0`) or commit hash (e.g., `abc1234`)

### Auto-detected Source Files

The installer checks for these files in order:

- `{pluginName}.plugin.zsh`
- `{pluginName}.zsh`
- `init.zsh`
- `plugin.zsh`
- `{pluginName}.zsh-theme`

## Adding Environment Variables

Use `.zsh()` to add environment variables or other shell configuration:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) =>
      shell.env({
        ZVM_VI_INSERT_ESCAPE_BINDKEY: 'jj',
        ZVM_CURSOR_STYLE_ENABLED: 'false',
      })
    )
);
```

The environment variables are set **before** the plugin is sourced, allowing you to configure the plugin's behavior.

## Troubleshooting

### Update fails

If `git pull --ff-only` fails, you may have local changes. Delete the plugin directory and reinstall, or manually reset it:

```bash
cd ~/.dotfiles-generated/plugins/<plugin-name>
git reset --hard origin/HEAD
```

## Related

- Manual Installation - For plugins requiring custom setup
- Shell Integration - How shell configs are generated
