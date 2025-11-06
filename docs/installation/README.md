# Installation Methods

The system supports multiple installation methods to accommodate different tool distribution patterns. Each method has its own parameters and use cases.

## Available Methods

### [GitHub Release](./github-release.md)
Install tools from GitHub releases with automatic asset selection and extraction.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository',
  })
    .bin('tool')
);
```

### [Homebrew](./homebrew.md)
Install tools using Homebrew package manager (macOS and Linux).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'ripgrep',
  })
    .bin('rg')
);
```

### [Cargo](./cargo.md)
Install Rust tools from crates.io with cargo-quickinstall for faster downloads.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  })
    .bin('rg')
);
```

### [Curl Script](./curl-script.md)
Download and execute installation scripts.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://bun.sh/install',
    shell: 'bash',
  })
    .bin('bun')
);
```

### [Curl Tar](./curl-tar.md)
Download and extract tarballs directly from URLs.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-tar', {
    url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  })
    .bin('tool')
);
```

### [Manual](./manual.md)
Install files from your dotfiles directory (custom scripts, pre-built binaries) or configuration-only tools.

```typescript
import { defineTool } from '@gitea/dotfiles';

// With binary installation
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './bin/my-script.sh',
  })
    .bin('my-script')
);

// Configuration-only
export default defineTool((install, ctx) =>
  install()
    .zsh({
      aliases: {
        ll: 'ls -la',
      },
    })
);
```

## Choosing the Right Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **GitHub Release** | Most open source tools | Automatic updates, cross-platform | Requires GitHub hosting |
| **Homebrew** | macOS/Linux tools | Simple, well-maintained | Platform-specific, requires Homebrew |
| **Cargo** | Rust tools | Fast pre-compiled binaries | Rust tools only |
| **Curl Script** | Custom installers | Flexible, handles complex setups | Less predictable, security concerns |
| **Curl Tar** | Direct downloads | Simple, no dependencies | Manual URL management |
| **Manual** | Custom scripts, configuration tools | Include files with dotfiles, flexible | Manual file management |

## Manual Installation Guide

The `manual` method is now the unified approach for both binary installation and configuration-only tools:

### Use **Manual** for Binary Installation:
- ✅ You have custom scripts or binaries to include with your dotfiles
- ✅ You want the system to manage and version your tool files
- ✅ You need shims generated for your custom tools
- ✅ You want to distribute pre-built binaries with your dotfiles

**Example:** Including a custom deployment script with your dotfiles.
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',
  })
    .bin('deploy')
);
```

### Use **Manual** for Configuration Only:
- ✅ You only need shell configuration (aliases, environment, symlinks)
- ✅ Tools are managed entirely outside the dotfiles system
- ✅ You don't want any binary installation or management
- ✅ Creating configuration-only "tools"

**Example:** Setting up shell aliases and environment variables.
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .zsh({
      aliases: {
        ll: 'ls -la',
      },
      environment: {
        EDITOR: 'vim',
      },
    })
);
```

## Common Parameters

Most installation methods support these common concepts:

- **Version Selection**: Specify exact versions or use constraints
- **Platform Detection**: Automatic selection of appropriate binaries
- **Binary Path**: Specify which file is the main executable
- **Asset Selection**: Choose the right download for your platform

## Next Steps

Choose an installation method to learn more:

- [GitHub Release](./github-release.md) - Most common method for open source tools
- [Homebrew](./homebrew.md) - Simple package manager installation
- [Cargo](./cargo.md) - Fast Rust tool installation