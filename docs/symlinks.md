# Symbolic Links

Create symlinks for configuration files with `.symlink()`.

## Syntax

```typescript
.symlink(source, target)
```

| Parameter | Description |
|-----------|-------------|
| `source` | Path to source file/directory. `./` is relative to tool config directory |
| `target` | Absolute path for symlink. Use context variables or `~` |

## Path Resolution

| Source | Resolution |
|--------|------------|
| `./config.toml` | Relative to `.tool.ts` directory |
| `/etc/tool.conf` | Absolute path |

| Target | Resolution |
|--------|------------|
| `~/.config/tool` | Expanded to `ctx.projectConfig.paths.homeDir` |
| `${ctx.projectConfig.paths.homeDir}/.config/tool` | Explicit context variable |

## Example

```
tools/my-tool/
├── my-tool.tool.ts
├── config.toml
└── themes/
    ├── dark.toml
    └── light.toml
```

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/my-tool' })
    .bin('my-tool')
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/my-tool/config.toml`)
    .symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/my-tool/themes`)
    .zsh((shell) =>
      shell.environment({
        MY_TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/my-tool/config.toml`,
      })
    )
);
```

## Common Patterns

```typescript
// Configuration files
.symlink('./gitconfig', `${ctx.projectConfig.paths.homeDir}/.gitconfig`)

// Directories
.symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/tool/themes`)

// Scripts
.symlink('./scripts/helper.sh', `${ctx.projectConfig.paths.homeDir}/bin/helper`)
```

## Correct vs Incorrect

```typescript
// ✅ Context variable
.symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)

// ✅ Tilde expansion
.symlink('./config.toml', '~/.config/tool/config.toml')

// ❌ Hardcoded path
.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```