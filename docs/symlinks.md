# Symbolic Links

The `.symlink()` method creates symbolic links for configuration files, allowing you to manage tool configurations alongside your tool definitions.

## Method Signature

```typescript
c.symlink(source: string, target: string)
```

## Parameters

- **`source`**: Path to source file or directory to be symlinked
  - **Relative paths** (starting with `./`): Relative to the **tool configuration directory** (where the `.tool.ts` file is located)
  - **Absolute paths**: Used as-is
  - Example: `'./config.toml'` looks for `config.toml` next to your `.tool.ts` file
  - Example: `'./themes/'` looks for `themes/` directory next to your `.tool.ts` file
- **`target`**: **Absolute path** where symlink should be created
  - Must be absolute path (use `${ctx.homeDir}/...`, `${ctx.dotfilesDir}/...`, etc.)
  - Example: `${ctx.homeDir}/.config/tool/config.toml`

## Path Resolution Rules

- **Source paths** starting with `./` → Relative to tool configuration directory (same directory as `.tool.ts` file)
- **Source paths** without `./` but not absolute → Also relative to tool configuration directory  
- **Source paths** starting with `/` → Absolute paths used as-is
- **Target paths** → Must always be absolute paths using context variables

## Examples

### Basic Configuration File

```typescript
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
```

### Multiple Configuration Files

```typescript
c
  .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
  .symlink('./themes/', `${ctx.homeDir}/.config/tool/themes`)
  .symlink('./scripts/helper.sh', `${ctx.homeDir}/bin/tool-helper`)
```

### Absolute Paths

```typescript
c.symlink('/etc/tool/global.conf', `${ctx.homeDir}/.config/tool/global.conf`)
```

## Directory Structure Example

```
configs/my-tool/
├── my-tool.tool.ts         # Configuration file
├── config.toml             # Tool's config file
├── themes/                 # Theme directory
│   ├── dark.toml
│   └── light.toml
└── scripts/
    └── helper.sh
```

```typescript
// In my-tool.tool.ts
c
  .symlink('./config.toml', `${ctx.homeDir}/.config/my-tool/config.toml`)
  .symlink('./themes/', `${ctx.homeDir}/.config/my-tool/themes`)
  .symlink('./scripts/helper.sh', `${ctx.homeDir}/bin/my-tool-helper`)
```

## Complete Example

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('my-tool')
    .version('latest')
    .install('github-release', { repo: 'owner/my-tool' })
    
    // Link configuration files
    .symlink('./config.yml', `${ctx.homeDir}/.config/my-tool/config.yml`)
    .symlink('./themes/', `${ctx.homeDir}/.config/my-tool/themes`)
    .symlink('./scripts/', `${ctx.homeDir}/.local/share/my-tool/scripts`)
    
    // Shell integration
    .zsh({
      environment: {
        'MY_TOOL_CONFIG': `${ctx.homeDir}/.config/my-tool/config.yml`
      },
      aliases: {
        'mt': 'my-tool'
      }
    });
};
```

## Use Cases

### Configuration Files

Link tool configuration files to their expected locations:

```typescript
c
  .symlink('./gitconfig', `${ctx.homeDir}/.gitconfig`)
  .symlink('./gitignore_global', `${ctx.homeDir}/.gitignore_global`)
```

### Theme and Asset Directories

Link entire directories of themes or assets:

```typescript
c
  .symlink('./themes/', `${ctx.homeDir}/.config/tool/themes`)
  .symlink('./fonts/', `${ctx.homeDir}/.local/share/fonts/tool-fonts`)
```

### Script and Binary Links

Create convenient links to scripts or additional binaries:

```typescript
c
  .symlink('./scripts/tool-helper.sh', `${ctx.homeDir}/bin/tool-helper`)
  .symlink('./bin/tool-dev', `${ctx.homeDir}/.local/bin/tool-dev`)
```

### Cross-Platform Considerations

Use context variables to ensure cross-platform compatibility:

```typescript
// ✅ Correct - uses context variables
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)

// ❌ Incorrect - hardcoded paths
c.symlink('./config.toml', '/home/user/.config/tool/config.toml')
c.symlink('./config.toml', '~/.config/tool/config.toml')
```

## Benefits

1. **Version Control**: Configuration files are version controlled alongside tool definitions
2. **Atomic Updates**: Symlinks are updated atomically with tool installations
3. **Centralized Management**: All tool-related files in one location
4. **Easy Maintenance**: Changes to configs are immediately reflected
5. **Backup Friendly**: Backing up the dotfiles directory includes all configurations

## Troubleshooting

### Symlink Creation Fails

**Check source file exists:**
```bash
# Verify source file is present
ls -la configs/tool-name/config.toml
```

**Check target directory:**
```bash
# Ensure target directory exists
mkdir -p ~/.config/tool-name
```

**Check permissions:**
```bash
# Verify write permissions to target directory
ls -ld ~/.config/tool-name
```

### Symlink Points to Wrong Location

**Verify path resolution:**
```typescript
// Debug path resolution in hook context
afterInstall: async ({ logger, toolConfig, ctx }) => {
  logger.warn('Tool config directory:', toolConfig.configDir);
  logger.warn('Source path:', './config.toml');
  logger.warn('Target path:', `${ctx.homeDir}/.config/tool/config.toml`);
}

**Check relative paths:**
- Ensure source paths start with `./` for relative paths
- Use absolute paths with context variables for targets

### Symlink Conflicts

**Handle existing files:**
- The system will backup existing files before creating symlinks
- Check for conflicts with existing configurations
- Consider migration strategies for existing setups

## Best Practices

1. **Use relative paths for sources**: Keep source paths relative to the tool configuration directory
2. **Use context variables for targets**: Always use `${ctx.homeDir}`, `${ctx.dotfilesDir}`, etc.
3. **Organize configuration files**: Keep related configs in subdirectories
4. **Document symlinks**: Comment complex symlink setups
5. **Test across platforms**: Ensure symlinks work on target operating systems

## Integration with Other Features

Symlinks work seamlessly with other configuration features:

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('tool')
    .install('github-release', { repo: 'owner/tool' })
    
    // Symlink configuration files
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    .symlink('./themes/', `${ctx.homeDir}/.config/tool/themes`)
    
    // Reference symlinked config in shell integration
    .zsh({
      environment: {
        'TOOL_CONFIG': `${ctx.homeDir}/.config/tool/config.toml`
      },
      shellInit: [
        always/* zsh */`
          # Tool will automatically find config at symlinked location
          function tool-reload() {
            tool --config "$TOOL_CONFIG" reload
          }
        `
      ]
    });
};
```

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments and aliases
- [Completions](./completions.md) - Set up command completions
- [Context API](./context-api.md) - Learn about path resolution with context variables