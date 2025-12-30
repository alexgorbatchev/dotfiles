# Path Resolution

How paths are resolved in tool configurations.

## Path Types by Method

| Method | Path | Resolution |
|--------|------|------------|
| `.symlink(src, dest)` | `src` with `./` | Relative to tool config directory |
| `.symlink(src, dest)` | `dest` | Absolute path (`~` expanded) |
| `.completions(path)` | `path` | Relative to extracted archive |
| `binaryPath` | github/cargo | Relative to extracted archive |
| `binaryPath` | manual | Absolute path |

## Context Path Variables

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    // ctx.toolDir - directory containing .tool.ts
    // ctx.currentDir - stable symlink to installed version
    // ctx.projectConfig.paths.homeDir - user home
    // ctx.projectConfig.paths.dotfilesDir - dotfiles root
    // ctx.projectConfig.paths.generatedDir - generated files
    // ctx.projectConfig.paths.targetDir - shims directory
    // ctx.projectConfig.paths.binariesDir - tool installations
);
```

## Examples

### Symlinks

```typescript
// Tool at: tools/my-tool/my-tool.tool.ts
// Files: tools/my-tool/config.toml, tools/my-tool/themes/

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
    .symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/tool/themes`)
);
```

### Completions from Archive

```typescript
// Archive contains: completions/_tool.zsh

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) => shell.completions('completions/_tool.zsh'))
);
```

### Shell Scripts

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        if [[ -f "${ctx.currentDir}/shell/key-bindings.zsh" ]]; then
          source "${ctx.currentDir}/shell/key-bindings.zsh"
        fi
      `)
    )
);
```

## Directory Structure

```
binaries/tool-name/
├── 1.2.3/           # Versioned install
│   ├── tool         # Binary
│   ├── lib/         # Dependencies
│   └── share/       # Assets
└── current -> 1.2.3 # Stable symlink
```

- Archives extracted to `binaries/tool-name/version/`
- `current` symlink updated after install
- Shims in `targetDir` execute `${ctx.currentDir}/binary`

## Common Mistakes

```typescript
// ❌ Hardcoded paths
.symlink('./config', '/home/user/.config/tool')

// ✅ Use context
.symlink('./config', `${ctx.projectConfig.paths.homeDir}/.config/tool`)

// ❌ Shell variable references
.always(`source $DOTFILES/init.zsh`)

// ✅ Use context
.always(`source "${ctx.currentDir}/init.zsh"`)
```

## Cross-Platform

Always use forward slashes - context variables handle platform differences:

```typescript
// Works on all platforms
.symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
```