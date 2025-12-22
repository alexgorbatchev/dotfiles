# Context API

The `ToolConfigContext` provides access to configuration paths and directories for tool configuration. This context is automatically passed to your tool configuration function and provides type-safe access to all configuration paths from the YAML config.

## Interface

```typescript
interface IToolConfigContext {
  /** Tool name being configured */
  toolName: string;

  /** Absolute path to the directory containing the tool's `.tool.ts` file */
  toolDir: string;

  /**
   * Absolute path to the tool's stable `current` directory.
   * Note: the directory/symlink may not exist until after a successful install.
   */
  currentDir: string;

  /** Full project configuration (including paths) */
  projectConfig: ProjectConfig;

  /** System info (platform/arch/homeDir) */
  systemInfo: SystemInfo;
}
```

## Usage Examples

### Accessing Tool Configuration Directory

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .environment({
          TOOL_CONFIG_DIR: ctx.toolDir
        })
        .always(/* zsh */`
          # Source tool-specific files
          if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.toolDir}/shell/key-bindings.zsh"
          fi
        `)
    )
);
```

### Accessing Other Tool Directories

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
        # Reference another tool's installation directory
        FZF_DIR="${ctx.projectConfig.paths.binariesDir}/fzf"
        if [[ -d "$FZF_DIR" ]]; then
          export FZF_BASE="$FZF_DIR"
        fi
      `)
    )
);
```

### Using Generated Directories

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.once(/* zsh */`
        # Generate completions to the proper directory
        tool gen-completions --shell zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
      `)
    )
);
```

### Path Properties

### Tool configuration directory (`ctx.toolDir`)
Absolute directory that contains the current tool's `.tool.ts` file.

Use this for referencing files that live next to the tool config (for example `./config.toml` or `./shell/*.zsh`).

### `ctx.projectConfig.paths.homeDir`
User's home directory from the YAML configuration.

**Usage:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    // Symlink configuration files
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
    // Set environment variables
    .zsh((shell) =>
      shell.environment({
        TOOL_DATA_DIR: `${ctx.projectConfig.paths.homeDir}/.local/share/tool`
      })
    )
);
```

### Tool binaries directory
Current tool's base installation directory. Contains version subdirectories.

**Structure:**
```
${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/
├── 1.2.3/           # Versioned install directory
│   ├── tool         # Entrypoint executable (copied from extracted archive)
│   ├── bin/
│   ├── lib/
│   └── share/
└── current -> 1.2.3 # Stable directory symlink
```

**Usage:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .environment({
          TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`
        })
        .always(/* zsh */`
          # Access tool assets
          if [[ -f "${ctx.currentDir}/share/themes/default.toml" ]]; then
            export TOOL_THEME="${ctx.currentDir}/share/themes/default.toml"
          fi
        `)
    )
);
```

### Referencing other tools
To reference another tool's base directory, join `projectConfig.paths.binariesDir` with the other tool's name.

**Usage:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
        # Integration with other tools
        NVIM_DIR="${ctx.projectConfig.paths.binariesDir}/nvim"
        FZF_DIR="${ctx.projectConfig.paths.binariesDir}/fzf"
        
        if [[ -d "$FZF_DIR" && -d "$NVIM_DIR" ]]; then
          export FZF_NVIM_INTEGRATION=true
        fi
      `)
    )
);
```

### `ctx.projectConfig.paths.generatedDir`
Directory for generated files (completions, caches, etc.).

**Usage:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.once(/* zsh */`
        # Generate completions once
        mkdir -p "${ctx.projectConfig.paths.generatedDir}/completions"
        tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
      `)
    )
);
```

### `ctx.projectConfig.paths.targetDir`
Directory where tool shims are generated.

**Usage:**
```typescript
c.hooks({
  afterInstall: async ({ fileSystem }) => {
    // Custom shim creation (rarely needed)
    await fileSystem.writeFile(
      `${ctx.projectConfig.paths.targetDir}/custom-tool-wrapper`,
      '#!/bin/bash\nexec tool --wrapper-mode "$@"'
    );
  }
})
```

### `ctx.projectConfig.paths.dotfilesDir`
Root dotfiles directory.

**Usage:**
```typescript
c.symlink('./themes/', `${ctx.projectConfig.paths.dotfilesDir}/.config/tool/themes`)
```

### `ctx.projectConfig.paths.shellScriptsDir`
Directory for generated shell scripts.

**Usage:**
```typescript
// Rarely used directly - shell scripts are generated automatically
```

## Path Resolution Benefits

- **Type Safety**: All paths are validated at compile time
- **Configuration Source**: Paths come from YAML config as single source of truth
- **No Hard-coding**: Eliminates hardcoded `$DOTFILES` or similar references
- **Flexibility**: Easy access to any configured directory
- **Consistency**: Same path resolution across all tools

## Common Patterns

### Configuration File Symlinks

```typescript
// ✅ Correct - using context for target path
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
);

// ❌ Incorrect - hardcoded path
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.toml', '~/.config/tool/config.toml')
);
```

### Environment Variables

```typescript
// ✅ Correct - using context variables
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`,
        TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/tool`
      })
    )
);

// ❌ Incorrect - hardcoded paths
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_HOME: '$DOTFILES/.generated/binaries/tool',
        TOOL_CONFIG: '$HOME/.config/tool'
      })
    )
);
```

### Shell Script Paths

```typescript
// ✅ Correct - using context in shell scripts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
        if [[ -f "${ctx.currentDir}/shell/init.zsh" ]]; then
          source "${ctx.currentDir}/shell/init.zsh"
        fi
      `)
    )
);
```

## Next Steps

- [Path Resolution](./path-resolution.md) - Detailed path resolution rules
- [Shell Integration](./shell-integration.md) - Using context in shell configuration
- [Symbolic Links](./symlinks.md) - File linking with context paths