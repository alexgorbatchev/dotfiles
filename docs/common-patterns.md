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
    .zsh((shell) =>
      shell
        .completions('complete/_rg')
        .aliases({
          rg: 'ripgrep',
        })
    )
    .bash((shell) => shell.completions('complete/rg.bash'))
);
```

Add `.dependsOn('binary-name')` calls when the tool needs other binaries to exist before it runs. The generator automatically orders installations based on these relationships.

## Tool with Dependency Providers

Use dedicated provider tools for shared binaries and declare dependencies in consumers so installation order and validation are handled automatically.

```typescript
// shared-dependency.tool.ts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('manual', { binaryPath: './bin/shared-dependency' })
    .bin('shared-dependency')
);

// consumer.tool.ts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/consumer' })
    .bin('consumer')
    .dependsOn('shared-dependency')
);
```

If a dependency is missing, ambiguous, or unsupported on the current platform, the CLI fails fast with an actionable error message.

## Tool with Complex Shell Integration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
    .zsh((shell) =>
      shell
        .environment({
          FZF_DEFAULT_OPTS: '--color=fg+:cyan,bg+:black,hl+:yellow',
        })
        .completions('shell/completion.zsh')
        .always(/* zsh */`
          # Source key bindings and create custom functions
          if [[ -f "${ctx.currentDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.currentDir}/shell/key-bindings.zsh"
          fi
          
          function fzf-jump-to-dir() {
            local dir=$(find . -type d | fzf)
            [[ -n "$dir" ]] && cd "$dir"
          }
          zle -N fzf-jump-to-dir
          bindkey '^]' fzf-jump-to-dir
        `)
    )
);
```

## Cross-Shell Tool with Declarative Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .bin('t')
    .version('latest')
    
    // Zsh configuration
    .zsh((shell) =>
      shell
        .completions('completions/_tool')
        .environment({
          TOOL_CONFIG_DIR: `${ctx.projectConfig.paths.homeDir}/.config/tool`,
          TOOL_LOG_LEVEL: 'info'
        })
        .aliases({ t: 'tool', ts: 'tool status' })
        .once(/* zsh */`
          tool completions zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
        `)
    )
    
    // Bash configuration
    .bash((shell) =>
      shell
        .completions('completions/tool.bash')
        .environment({
          TOOL_CONFIG_DIR: `${ctx.projectConfig.paths.homeDir}/.config/tool`,
          TOOL_LOG_LEVEL: 'info'
        })
        .aliases({ t: 'tool', ts: 'tool status' })
    )
    .powershell((shell) =>
      shell
        .completions('completions/tool.ps1')
        .environment({
          TOOL_CONFIG_DIR: `${ctx.projectConfig.paths.homeDir}\\.config\\tool`,
          TOOL_LOG_LEVEL: 'info'
        })
        .aliases({ t: 'tool', ts: 'tool status' })
    )
);
```

## Tool with Configuration Files and Hooks

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .version('latest')
    .symlink('./config.yml', `${ctx.projectConfig.paths.homeDir}/.config/custom-tool/config.yml`)
    .hook('after-install', async ({ toolName, installedDir, systemInfo, fileSystem, logger, $ }) => {
      const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
      await fileSystem.ensureDir(dataDir);
      await $`${path.join(installedDir ?? '', toolName)} init --data-dir ${dataDir}`;
      logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
    })
    .zsh((shell) =>
      shell
        .environment({ CUSTOM_TOOL_DATA: `${ctx.projectConfig.paths.homeDir}/.local/share/custom-tool` })
        .aliases({ ct: 'custom-tool', lg: 'custom-tool' })
    )
);
```

## Platform-Specific Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';
import { Platform, Architecture } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest')
    
    // macOS-specific
    .platform(Platform.MacOS, (installMac) => {
      return installMac('brew', { formula: 'tool' })
        .zsh((shell) => shell.aliases({ t: 'tool --macos-mode' }));
    })
    
    // Linux-specific  
    .platform(Platform.Linux, (installLinux) => {
      return installLinux('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
        .zsh((shell) => shell.aliases({ t: 'tool --linux-mode' }));
    })
    
    // Windows with architecture-specific configuration
    .platform(Platform.Windows, Architecture.Arm64, (installWin) => {
      return installWin('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-arm64.zip',
      })
        .powershell((shell) =>
          shell
            .environment({ TOOL_ARCH: 'arm64' })
            .aliases({ t: 'tool --windows-mode' })
        );
    })
);
```

## Rust Tool with Cargo

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'eza',
    githubRepo: 'eza-community/eza',
  })
    .bin('eza')
    .bin('exa')
    .version('latest')
    .zsh((shell) =>
      shell
        .completions('completions/eza.zsh')
        .aliases({
          ls: 'eza',
          ll: 'eza -l',
          la: 'eza -la',
          tree: 'eza --tree'
        })
        .environment({
          EZA_COLORS: 'da=1;34:gm=1;34'
        })
    )
    .bash((shell) => shell.completions('completions/eza.bash'))
);
```

## Custom Script Tool

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',
  })
    .bin('deploy')
    .symlink('./deploy.config.yaml', `${ctx.projectConfig.paths.homeDir}/.config/deploy/config.yaml`)
    .zsh((shell) =>
      shell
        .aliases({
          dp: 'deploy',
          'deploy-prod': 'deploy --env production',
          'deploy-staging': 'deploy --env staging',
        })
        .environment({
          DEPLOY_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/deploy/config.yaml`
        })
        .always(/* zsh */`
          # Deploy tool helpers
          function deploy-status() { deploy status "$@"; }
        `)
    )
);
```

## Configuration-Only Tool

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .symlink('./gitconfig', `${ctx.projectConfig.paths.homeDir}/.gitconfig`)
    .symlink('./gitignore_global', `${ctx.projectConfig.paths.homeDir}/.gitignore_global`)
    .zsh((shell) =>
      shell
        .aliases({
          g: 'git',
          gs: 'git status',
          ga: 'git add',
          gc: 'git commit',
          gp: 'git push',
          gl: 'git pull',
          gd: 'git diff',
          gb: 'git branch',
          gco: 'git checkout'
        })
        .environment({
          GIT_EDITOR: 'nvim'
        })
    )
);
```

## Tool with Custom Asset Selection

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/custom-tool',
    assetSelector: (context) => {
      const { assets, systemInfo } = context;
      
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
      
      const platform = platformMap[systemInfo.platform];
      const arch = archMap[systemInfo.arch];
      
      return assets.find(asset => 
        asset.name.includes(platform) && 
        asset.name.includes(arch) &&
        asset.name.endsWith('.tar.gz')
      );
    }
  })
    .bin('custom-tool')
    .version('latest')
    .zsh((shell) => shell.aliases({ ct: 'custom-tool' }))
);
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
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetPattern: '*linux_amd64.tar.gz',
  })
    .bin('tool')
);
```

### Custom Scripts and Binaries
```typescript
// For scripts/binaries included with your dotfiles
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/my-tool.sh',  // Relative to .tool.ts
  })
    .bin('my-tool')
);
```

### Configuration-Only Tool
```typescript
// For pure shell configuration without binaries
export default defineTool((install, ctx) =>
  install()  // Configuration-only: no install params, no .bin()
    .zsh((shell) => shell.aliases({ myalias: 'mycommand' }))
);
```

### When to Use Each Method

| Use Case | Method | Example |
|----------|--------|---------|
| Download from GitHub | `github-release` | fzf, ripgrep, bat |
| Package manager tools | `brew`, `cargo` | git, rust tools |
| Custom helper scripts | `manual` | deployment scripts, wrappers |
| Pure shell config | `install()` | aliases, environment vars |
| Download scripts | `curl-script` | Node.js, Rust installers |

## Next Steps

- [Migration Guide](./migration.md) - Convert existing shell configurations
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [API Reference](./api-reference.md) - Complete method documentation