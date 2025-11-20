# Context API

The `ToolConfigContext` provides access to configuration paths and directories for tool configuration. This context is automatically passed to your tool configuration function and provides type-safe access to all configuration paths from the YAML config.

## Interface

```typescript
interface ToolConfigContext {
  /** Current tool's installation directory (should contain version subdirectories) */
  toolDir: string;
  
  /** Get the installation directory for any tool */
  getToolDir(toolName: string): string;
  
  /** User's home directory (from projectConfig.paths.homeDir) */
  homeDir: string;
  
  /** Generated binaries directory (from projectConfig.paths.binariesDir) */
  binDir: string;
  
  /** Generated shell scripts directory (from projectConfig.paths.shellScriptsDir) */
  shellScriptsDir: string;
  
  /** Root dotfiles directory (from projectConfig.paths.dotfilesDir) */
  dotfilesDir: string;
  
  /** Generated files directory (from projectConfig.paths.generatedDir) */
  generatedDir: string;
}
```

## Usage Examples

### Accessing Current Tool Directory

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh((shell) =>
    shell
      .environment({
        TOOL_CONFIG_DIR: `${ctx.toolDir}`
      })
      .always(/* zsh */`
        # Source tool-specific files
        if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
          source "${ctx.toolDir}/shell/key-bindings.zsh"
        fi
      `)
  );
};
```

### Accessing Other Tool Directories

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh((shell) =>
    shell.always(/* zsh */`
      # Reference another tool's directory
      FZF_DIR="${ctx.getToolDir('fzf')}"
      if [[ -d "$FZF_DIR" ]]; then
        export FZF_BASE="$FZF_DIR"
      fi
    `)
  );
};
```

### Using Generated Directories

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh((shell) =>
    shell.once(/* zsh */`
      # Generate completions to the proper directory
      tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
    `)
  );
};
```

## Path Properties

### `ctx.homeDir`
User's home directory from the YAML configuration.

**Usage:**
```typescript
// Symlink configuration files
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)

// Set environment variables
c.zsh((shell) =>
  shell.environment({
    TOOL_DATA_DIR: `${ctx.homeDir}/.local/share/tool`
  })
)
```

### `ctx.toolDir`
Current tool's base installation directory. Contains version subdirectories.

**Structure:**
```
${ctx.toolDir}/
├── latest/          # Current version installation
│   ├── bin/
│   ├── lib/
│   └── share/
└── v1.2.3/         # Previous version
    ├── bin/
    └── ...
```

**Usage:**
```typescript
c.zsh((shell) =>
  shell
    .environment({
      TOOL_HOME: `${ctx.toolDir}`
    })
    .always(/* zsh */`
      # Access tool assets
      if [[ -f "${ctx.toolDir}/latest/share/themes/default.toml" ]]; then
        export TOOL_THEME="${ctx.toolDir}/latest/share/themes/default.toml"
      fi
    `)
)
```

### `ctx.getToolDir(toolName)`
Get the installation directory for any other tool.

**Usage:**
```typescript
c.zsh((shell) =>
  shell.always(/* zsh */`
    # Integration with other tools
    NVIM_DIR="${ctx.getToolDir('nvim')}"
    FZF_DIR="${ctx.getToolDir('fzf')}"
    
    if [[ -d "$FZF_DIR" && -d "$NVIM_DIR" ]]; then
      export FZF_NVIM_INTEGRATION=true
    fi
  `)
)
```

### `ctx.generatedDir`
Directory for generated files (completions, caches, etc.).

**Usage:**
```typescript
c.zsh((shell) =>
  shell.once(/* zsh */`
    # Generate completions once
    mkdir -p "${ctx.generatedDir}/completions"
    tool completion zsh > "${ctx.generatedDir}/completions/_tool"
  `)
)
```

### `ctx.binDir`
Directory where tool shims are generated.

**Usage:**
```typescript
c.hooks({
  afterInstall: async ({ fileSystem }) => {
    // Custom shim creation (rarely needed)
    await fileSystem.writeFile(
      `${ctx.binDir}/custom-tool-wrapper`,
      '#!/bin/bash\nexec tool --wrapper-mode "$@"'
    );
  }
})
```

### `ctx.dotfilesDir`
Root dotfiles directory.

**Usage:**
```typescript
c.symlink('./themes/', `${ctx.dotfilesDir}/.config/tool/themes`)
```

### `ctx.shellScriptsDir`
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
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)

// ❌ Incorrect - hardcoded path
c.symlink('./config.toml', '~/.config/tool/config.toml')
```

### Environment Variables

```typescript
// ✅ Correct - using context variables
c.zsh((shell) =>
  shell.environment({
    TOOL_HOME: `${ctx.toolDir}`,
    TOOL_CONFIG: `${ctx.homeDir}/.config/tool`
  })
)

// ❌ Incorrect - hardcoded paths
c.zsh((shell) =>
  shell.environment({
    TOOL_HOME: '$DOTFILES/.generated/binaries/tool',
    TOOL_CONFIG: '$HOME/.config/tool'
  })
)
```

### Shell Script Paths

```typescript
// ✅ Correct - using context in shell scripts
c.zsh((shell) =>
  shell.always(/* zsh */`
    if [[ -f "${ctx.toolDir}/shell/init.zsh" ]]; then
      source "${ctx.toolDir}/shell/init.zsh"
    fi
  `)
)
```

## Next Steps

- [Path Resolution](./path-resolution.md) - Detailed path resolution rules
- [Shell Integration](./shell-integration.md) - Using context in shell configuration
- [Symbolic Links](./symlinks.md) - File linking with context paths