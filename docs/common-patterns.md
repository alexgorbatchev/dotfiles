# Common Patterns

This section provides real-world examples and common patterns for tool configurations.

## Simple GitHub Tool

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    .bin('rg')
    .zsh({
      completions: {
        source: 'complete/_rg',
      },
      aliases: {
        rg: 'ripgrep',
      },
    })
    .bash({
      completions: {
        source: 'complete/rg.bash',
      },
    })
);
```

## Tool with Complex Shell Integration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
    .zsh({
      environment: {
        FZF_DEFAULT_OPTS: '--color=fg+:cyan,bg+:black,hl+:yellow',
      },
      completions: {
        source: 'shell/completion.zsh',
      },
      shellInit: `
        # Source key bindings and create custom functions
        if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
          source "${ctx.toolDir}/shell/key-bindings.zsh"
        fi
        
        function fzf-jump-to-dir() {
          local dir=$(find . -type d | fzf)
          [[ -n "$dir" ]] && cd "$dir"
        }
        zle -N fzf-jump-to-dir
        bindkey '^]' fzf-jump-to-dir
      `,
    })
);
```

## Cross-Shell Tool with Declarative Configuration

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { always, once } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin(['tool', 't'])
    .version('latest')
    .install('github-release', { repo: 'owner/tool' })
    
    // Zsh configuration
    .zsh({
      completions: { source: 'completions/_tool' },
      environment: {
        'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
        'TOOL_LOG_LEVEL': 'info'
      },
      aliases: { 't': 'tool', 'ts': 'tool status' },
      shellInit: [
        once/* zsh */`
          tool completions zsh > "${ctx.generatedDir}/completions/_tool"
        `
      ]
    })
    
    // Bash and PowerShell configurations
    .bash({
      completions: { source: 'completions/tool.bash' },
      environment: {
        'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
        'TOOL_LOG_LEVEL': 'info'
      },
      aliases: { 't': 'tool', 'ts': 'tool status' }
    })
    .powershell({
      completions: { source: 'completions/tool.ps1' },
      environment: {
        'TOOL_CONFIG_DIR': `${ctx.homeDir}\\.config\\tool`,
        'TOOL_LOG_LEVEL': 'info'
      },
      aliases: { 't': 'tool', 'ts': 'tool status' }
    });
};
```

## Tool with Configuration Files and Hooks

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import path from 'path';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('custom-tool')
    .version('latest')
    .install('github-release', { repo: 'owner/custom-tool' })
    .symlink('./config.yml', `${ctx.homeDir}/.config/custom-tool/config.yml`)
    .hooks({
      afterInstall: async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
        const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
        await fileSystem.mkdir(dataDir, { recursive: true });
        await $`${path.join(installDir, toolName)} init --data-dir ${dataDir}`;
        logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
      }
    })
    .zsh({
      environment: { 'CUSTOM_TOOL_DATA': `${ctx.homeDir}/.local/share/custom-tool` },
      aliases: { 'ct': 'custom-tool', 'lg': 'custom-tool' }
    });
};
```

## Platform-Specific Configuration

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { Platform, Architecture } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Common configuration for all platforms
  c.bin('tool').version('latest');
    
  // macOS-specific
  c.platform(Platform.MacOS, (c) => {
    c.install('brew', { formula: 'tool' })
     .zsh({ aliases: { 't': 'tool --macos-mode' } });
  });
  
  // Linux-specific  
  c.platform(Platform.Linux, (c) => {
    c.install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
     .zsh({ aliases: { 't': 'tool --linux-mode' } });
  });
  
  // Windows with architecture-specific configuration
  c.platform(Platform.Windows, Architecture.Arm64, (c) => {
    c.install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-arm64.zip',
      })
     .powershell({ 
       environment: { 'TOOL_ARCH': 'arm64' },
       aliases: { 't': 'tool --windows-mode' }
     });
  });
};
```

## Rust Tool with Cargo

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin(['eza', 'exa'])  // Provides both new and legacy binary names
    .version('latest')
    .install('cargo', {
      crateName: 'eza',
      githubRepo: 'eza-community/eza',
    })
    .zsh({
      completions: { source: 'completions/eza.zsh' },
      aliases: {
        'ls': 'eza',
        'll': 'eza -l',
        'la': 'eza -la',
        'tree': 'eza --tree'
      },
      environment: {
        'EZA_COLORS': 'da=1;34:gm=1;34'
      }
    })
    .bash({
      completions: { source: 'completions/eza.bash' }
    });
};
```

## Custom Script Tool

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('deploy')
    .install('manual', {
      binaryPath: './scripts/deploy.sh',  // Script included with dotfiles
    })
    .symlink('./deploy.config.yaml', `${ctx.homeDir}/.config/deploy/config.yaml`)
    .zsh({
      aliases: {
        'dp': 'deploy',
        'deploy-prod': 'deploy --env production',
        'deploy-staging': 'deploy --env staging',
      },
      environment: {
        'DEPLOY_CONFIG': `${ctx.homeDir}/.config/deploy/config.yaml`
      },
      shellInit: [
        always`# Deploy tool helpers`,
        always`function deploy-status() { deploy status "$@"; }`
      ]
    });
};
```

## Configuration-Only Tool

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .install('manual', {})  // No binary management
    .symlink('./gitconfig', `${ctx.homeDir}/.gitconfig`)
    .symlink('./gitignore_global', `${ctx.homeDir}/.gitignore_global`)
    .zsh({
      aliases: {
        'g': 'git',
        'gs': 'git status',
        'ga': 'git add',
        'gc': 'git commit',
        'gp': 'git push',
        'gl': 'git pull',
        'gd': 'git diff',
        'gb': 'git branch',
        'gco': 'git checkout'
      },
      environment: {
        'GIT_EDITOR': 'nvim'
      }
    });
};
```

## Tool with Custom Asset Selection

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('custom-tool')
    .version('latest')
    .install('github-release', {
      repo: 'owner/custom-tool',
      assetSelector: (assets, sysInfo) => {
        // Custom logic for complex naming schemes
        const platformMap = {
          'darwin': 'macos',
          'linux': 'linux',
          'win32': 'windows'
        };
        
        const archMap = {
          'x64': 'amd64',
          'arm64': 'arm64'
        };
        
        const platform = platformMap[sysInfo.platform];
        const arch = archMap[sysInfo.arch];
        
        return assets.find(asset => 
          asset.name.includes(platform) && 
          asset.name.includes(arch) &&
          asset.name.endsWith('.tar.gz')
        );
      }
    })
    .zsh({
      aliases: { 'ct': 'custom-tool' }
    });
};
```

## Best Practices Summary

1. **Use declarative configuration** for simple environment variables and aliases
2. **Use script-based configuration** for complex functions and logic
3. **Leverage context variables** for all path references
4. **Test across platforms** when using platform-specific features
5. **Keep shell init scripts fast** - use `once` for expensive operations
6. **Follow naming conventions** - kebab-case for file names
7. **Provide completions** when available from the tool
8. **Use appropriate installation methods** based on tool distribution

## Installation Method Selection

### GitHub Tools (Most Common)
```typescript
// For most open source tools hosted on GitHub
c.install('github-release', {
  repo: 'owner/tool',
  assetPattern: '*linux_amd64.tar.gz',
})
```

### Custom Scripts and Binaries
```typescript
// For scripts/binaries included with your dotfiles
c.install('manual', {
  binaryPath: './scripts/my-tool.sh',  // Relative to .tool.ts
})
```

### Configuration-Only Tool
```typescript
// For pure shell configuration without binaries
c.install('manual', {})  // No binaryPath = configuration only
```

### When to Use Each Method

| Use Case | Method | Example |
|----------|--------|---------|
| Download from GitHub | `github-release` | fzf, ripgrep, bat |
| Package manager tools | `brew`, `cargo` | git, rust tools |
| Custom helper scripts | `manual` | deployment scripts, wrappers |
| Pure shell config | `manual` | aliases, environment vars |
| Download scripts | `curl-script` | Node.js, Rust installers |

## Next Steps

- [Migration Guide](./migration.md) - Convert existing shell configurations
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [API Reference](./api-reference.md) - Complete method documentation