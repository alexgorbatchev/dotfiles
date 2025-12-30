# Context API

The `ctx` parameter in `defineTool` provides access to tool and project information.

## Properties

| Property | Description |
|----------|-------------|
| `ctx.toolName` | Name of the tool being configured |
| `ctx.toolDir` | Directory containing the `.tool.ts` file |
| `ctx.currentDir` | Tool's stable `current` directory (after install) |
| `ctx.projectConfig` | Full project configuration |
| `ctx.systemInfo` | Platform, architecture, and home directory |

### Path Properties via projectConfig

| Path | Description |
|------|-------------|
| `ctx.projectConfig.paths.homeDir` | User's home directory |
| `ctx.projectConfig.paths.dotfilesDir` | Root dotfiles directory |
| `ctx.projectConfig.paths.binariesDir` | Tool binaries directory |
| `ctx.projectConfig.paths.generatedDir` | Generated files directory |
| `ctx.projectConfig.paths.targetDir` | Shim directory |
| `ctx.projectConfig.paths.shellScriptsDir` | Shell scripts directory |

## Examples

### Referencing Files Next to Tool Config

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
        source "${ctx.toolDir}/shell/key-bindings.zsh"
      `)
    )
);
```

### Setting Environment Variables

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`,
      })
    )
);
```

### Using currentDir for Installed Assets

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
        export TOOL_THEME="${ctx.currentDir}/share/themes/default.toml"
      `)
    )
);
```

### Symlinks with Home Directory

```typescript
// Using ~ shorthand (recommended)
.symlink('./config.toml', '~/.config/tool/config.toml')

// Or explicit homeDir
.symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
```

## Directory Structure

```
${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/
├── 1.2.3/              # Versioned install directory
│   ├── tool            # Binary
│   └── share/          # Assets
└── current -> 1.2.3    # Stable symlink (ctx.currentDir)
```