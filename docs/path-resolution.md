# Path Resolution

Understanding how paths are resolved is crucial for correctly configuring your tools. Different methods have different path resolution rules.

## Tool Configuration Directory

- **Location**: The directory containing your `.tool.ts` file
- **Example**: If your configuration is at `configs/fzf/fzf.tool.ts`, then the tool directory is `configs/fzf/`

## Path Resolution Rules by Method

| Method | Path Type | Resolution Rule | Example |
|--------|-----------|-----------------|---------|
| **symlink()** | `source` starting with `./` | Relative to tool configuration directory | `'./config.toml'` → `configs/fzf/config.toml` |
| **symlink()** | `source` absolute path | Used as-is | `'/etc/global.conf'` → `/etc/global.conf` |
| **symlink()** | `target` | Must be absolute (use context) | `${ctx.homeDir}/.config/tool/config.toml` |
| **completions()** | `source` | Relative to extracted archive root | `'shell/completion.zsh'` → inside downloaded archive |
| **completions()** | `targetDir` | Must be absolute (optional) | `${ctx.homeDir}/.zsh/completions` |
| **install('github-release')** | `binaryPath` | Relative to extracted archive root | `'bin/tool'` → locates binary inside downloaded archive |
| **install('manual')** | `binaryPath` | Must be absolute path | `'/usr/local/bin/tool'` or `${ctx.homeDir}/bin/tool` |

## Context Variables for Paths

Always use ToolConfigContext variables for dynamic paths:

- `${ctx.homeDir}` → User's home directory  
- `${ctx.toolDir}` → Tool's base installation directory (contains version subdirectories)
- `${ctx.dotfilesDir}` → Root dotfiles directory
- `${ctx.generatedDir}` → Generated files directory
- `${ctx.binDir}` → Generated shims directory (where tool shims are created)
- `${ctx.shellScriptsDir}` → Generated shell scripts directory
- `${ctx.getToolDir('other-tool')}` → Another tool's base directory

## Path Resolution Benefits

- **Type Safety**: All paths are validated at compile time
- **Configuration Source**: Paths come from YAML config as single source of truth
- **No Hard-coding**: Eliminates hardcoded `$DOTFILES` or similar references
- **Flexibility**: Easy access to any configured directory
- **Consistency**: Same path resolution across all tools

## Tool Version Directory Structure

For referencing files within the current tool version, you'll typically need to construct paths like:
- `${ctx.toolDir}/latest/share/` for tool assets
- `${ctx.toolDir}/latest/config/` for tool configs

## Common Path Patterns

### Correct Usage

```typescript
// ✅ Correct symlink usage
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    .zsh((shell) => shell.completions('shell/completion.zsh'))
);

// ✅ Correct install usage with binary path
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    binaryPath: 'bin/tool',           // Binary location inside archive
  })
    .bin('tool')
);

// ✅ Correct shell script paths
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
          source "${ctx.toolDir}/shell/key-bindings.zsh"
        fi
      `)
    )
);
```

### Incorrect Usage

```typescript
// ❌ Incorrect - using hardcoded paths
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', '~/.config/tool/config.toml')  // Wrong
);

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', '/home/user/.config/tool/config.toml')  // Wrong
);

// ❌ Incorrect - hardcoded environment variables in shell scripts
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .zsh((shell) =>
      shell.always(`
        export TOOL_HOME="$HOME/.local/share/tool"  # Use declarative environment instead
        source "$DOTFILES/.config/tool/init.zsh"    # Use ${ctx.toolDir} instead
      `)
    )
);
```

## Recommended Directory Structure

For optimal tool management, the system uses a versioned directory structure that preserves archive integrity:

```
${ctx.generatedDir}/binaries/
└── tool-name/
    └── version/                 # e.g., "1.2.3" or "latest"  
        ├── bin/                 # Extracted archive contents (preserved)
        │   └── tool-binary
        ├── lib/                 # Shared libraries (if any)
        ├── share/               # Assets, docs, etc.
        └── config/              # Default configs
```

### Benefits of This Approach

- **Archive Integrity**: Tools can access their dependencies (shared libs, configs, assets)
- **Version Management**: Easy to switch between versions or rollback
- **Immutable Installs**: Once extracted, archives remain untouched
- **Shim-Based Execution**: Shims in `${ctx.binDir}` point to actual binaries

### How It Works

1. Archives are extracted to `${ctx.toolDir}/version/` 
2. Archive structure is preserved completely
3. `binaryPath` identifies which file is the main executable
4. Shims are generated in `${ctx.binDir}/` that execute the binary from its original location
5. No files are moved or copied from the extraction location

## Path Resolution Examples

### Symlink Path Resolution

```typescript
// Tool configuration at: configs/my-tool/my-tool.tool.ts
// Files in same directory:
// ├── my-tool.tool.ts
// ├── config.toml
// └── themes/
//     ├── dark.toml
//     └── light.toml

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/my-tool' })
    .bin('my-tool')
    .symlink('./config.toml', `${ctx.homeDir}/.config/my-tool/config.toml`)
    .symlink('./themes/', `${ctx.homeDir}/.config/my-tool/themes`)
);

// Results in:
// ~/.config/my-tool/config.toml -> configs/my-tool/config.toml
// ~/.config/my-tool/themes -> configs/my-tool/themes/
```

### Completion Path Resolution

```typescript
// After extracting archive with structure:
// extracted-archive/
// ├── bin/
// │   └── tool
// └── completions/
//     ├── _tool.zsh
//     └── tool.bash

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) => shell.completions('completions/_tool.zsh'))
    .bash((shell) => shell.completions('completions/tool.bash'))
);

// Completions are copied from:
// extracted-archive/completions/_tool.zsh -> ${ctx.generatedDir}/completions/_tool
// extracted-archive/completions/tool.bash -> ${ctx.generatedDir}/completions/tool.bash
```

### Binary Path Resolution

```typescript
// Archive structure:
// extracted-archive/
// ├── bin/
// │   └── my-tool
// ├── lib/
// └── share/

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/my-tool',
    binaryPath: 'bin/my-tool'  // Points to extracted-archive/bin/my-tool
  })
    .bin('my-tool')
);

// Shim created at: ${ctx.binDir}/my-tool
// Shim executes: ${ctx.toolDir}/latest/bin/my-tool
```

## Cross-Platform Path Considerations

### Use Forward Slashes

```typescript
// ✅ Correct - works on all platforms
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
);

// ❌ Incorrect - Windows-specific paths in forward slashes
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('.\\config.toml', `${ctx.homeDir}\\.config\\tool\\config.toml`)  // Wrong
);
```

### Context Variables Handle Platform Differences

```typescript
// Context variables automatically handle platform differences:
// Linux/macOS: /home/user/.config/tool/config.toml
// Windows: C:\Users\user\.config\tool\config.toml

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
);
```

## Debugging Path Issues

### Check Path Resolution

```typescript
c.hooks({
  beforeInstall: async ({ logger }) => {
    logger.info(`Tool directory: ${ctx.toolDir}`);
    logger.info(`Home directory: ${ctx.homeDir}`);
    logger.info(`Generated directory: ${ctx.generatedDir}`);
    logger.info(`Bin directory: ${ctx.binDir}`);
  }
})
```

### Verify File Existence

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('before-install', async ({ logger }) => {
      logger.info(`Tool directory: ${ctx.toolDir}`);
      logger.info(`Home directory: ${ctx.homeDir}`);
      logger.info(`Generated directory: ${ctx.generatedDir}`);
      logger.info(`Bin directory: ${ctx.binDir}`);
    })
    .hook('after-install', async ({ fileSystem, logger }) => {
      const configExists = await fileSystem.exists('./config.toml');
      logger.info(`Config file exists: ${configExists}`);
      
      const symlinkTarget = `${ctx.homeDir}/.config/tool/config.toml`;
      const symlinkExists = await fileSystem.exists(symlinkTarget);
      logger.info(`Symlink created: ${symlinkExists}`);
    })
);
```

## Best Practices

1. **Always use context variables** for dynamic paths
2. **Use relative paths** for files next to your `.tool.ts` file
3. **Use absolute paths** for symlink targets
4. **Test path resolution** on different platforms
5. **Document complex path setups** in comments
6. **Avoid hardcoded paths** like `$HOME`, `$DOTFILES`, etc.

## Next Steps

- [Context API](./context-api.md) - Learn about ToolConfigContext properties
- [Symbolic Links](./symlinks.md) - Understand symlink path resolution
- [Shell Integration](./shell-integration.md) - Use paths in shell scripts