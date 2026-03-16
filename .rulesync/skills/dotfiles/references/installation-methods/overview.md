# Installation Methods Overview

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

Install macOS applications from DMG disk images into `~/Applications` (silently skipped on other platforms).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('dmg', {
    source: {
      type: 'url',
      url: 'https://example.com/MyApp-1.0.0.dmg',
    },
  })
);
```

DMG also supports GitHub release sources:

```typescript
install('dmg', {
  source: {
    type: 'github-release',
    repo: 'manaflow-ai/cmux',
    assetPattern: '*macos*.dmg',
  },
});
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
