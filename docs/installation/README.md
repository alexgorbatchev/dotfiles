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
  }).bin('tool')
);
```

### [Gitea/Forgejo Release](./gitea-release.md)

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

### [Homebrew](./homebrew.md)

Install tools using Homebrew package manager (macOS and Linux).

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'ripgrep',
  }).bin('rg')
);
```

### [Cargo](./cargo.md)

Install Rust tools from crates.io with cargo-quickinstall for faster downloads.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).bin('rg')
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
  }).bin('bun')
);
```

### [Curl Tar](./curl-tar.md)

Download and extract tarballs directly from URLs.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('curl-tar', {
    url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  }).bin('tool')
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
  }).bin('my-script')
);

// Configuration-only
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: 'ls -la' })));
```

### [Zsh Plugin](./zsh-plugin.md)

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

| Method             | Best For                            | Pros                                  | Cons                                 |
| ------------------ | ----------------------------------- | ------------------------------------- | ------------------------------------ |
| **GitHub Release** | Most open source tools              | Automatic updates, cross-platform     | Requires GitHub hosting              |
| **Gitea/Forgejo**  | Codeberg / self-hosted Gitea tools  | Supports any Gitea-compatible host    | Requires instance URL                |
| **Homebrew**       | macOS/Linux tools                   | Simple, well-maintained               | Platform-specific, requires Homebrew |
| **Cargo**          | Rust tools                          | Fast pre-compiled binaries            | Rust tools only                      |
| **Curl Script**    | Custom installers                   | Flexible, handles complex setups      | Less predictable, security concerns  |
| **Curl Tar**       | Direct downloads                    | Simple, no dependencies               | Manual URL management                |
| **Manual**         | Custom scripts, configuration tools | Include files with dotfiles, flexible | Manual file management               |
| **Zsh Plugin**     | Zsh plugins from Git repos          | Simple, automatic updates             | Zsh plugins only                     |

## Manual Installation Guide

The `manual` method is the unified approach for binary installation from your dotfiles directory.

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
  }).bin('deploy')
);
```

### Use `install()` for Configuration Only:

- ✅ You only need shell configuration (aliases, environment, symlinks)
- ✅ Tools are managed entirely outside the dotfiles system
- ✅ You don't want any binary installation or management
- ✅ Creating configuration-only "tools"

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

## Next Steps

Choose an installation method to learn more:

- [GitHub Release](./github-release.md) - Most common method for open source tools
- [Gitea/Forgejo Release](./gitea-release.md) - Tools hosted on Codeberg, Forgejo, or self-hosted Gitea
- [Homebrew](./homebrew.md) - Simple package manager installation
- [Cargo](./cargo.md) - Fast Rust tool installation
