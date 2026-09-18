# Context API

The `ctx` parameter in `defineTool` provides access to tool and project information.

## Properties

| Property            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `ctx.toolName`      | Name of the tool being configured                 |
| `ctx.toolDir`       | Directory containing the `.tool.ts` file          |
| `ctx.currentDir`    | Tool's stable `current` directory (after install) |
| `ctx.projectConfig` | Full project configuration                        |
| `ctx.systemInfo`    | Platform, architecture, and home directory        |
| `ctx.replaceInFile` | Replace text in files using regex patterns        |
| `ctx.resolve`       | Resolve glob pattern to a single path             |
| `ctx.log`           | Logger for user-facing output                     |

### Path Properties via projectConfig

| Path                                      | Description               |
| ----------------------------------------- | ------------------------- |
| `ctx.projectConfig.paths.dotfilesDir`     | Root dotfiles directory   |
| `ctx.projectConfig.paths.binariesDir`     | Tool binaries directory   |
| `ctx.projectConfig.paths.generatedDir`    | Generated files directory |
| `ctx.projectConfig.paths.targetDir`       | Shim directory            |
| `ctx.projectConfig.paths.shellScriptsDir` | Shell scripts directory   |

> **Note:** For home directory paths, use `~/` instead of `ctx.projectConfig.paths.homeDir`. Tilde expansion is automatic.

## Examples

### Referencing Files Next to Tool Config

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.always(/* zsh */ `
        source "${ctx.toolDir}/shell/key-bindings.zsh"
      `),
    ),
);
```

### Setting Environment Variables

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.env({
        TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`,
      }),
    ),
);
```

### Using currentDir for Installed Assets

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.always(/* zsh */ `
        export TOOL_THEME="${ctx.currentDir}/share/themes/default.toml"
      `),
    ),
);
```

### Utilities on the Context

`ctx.replaceInFile`, `ctx.resolve` and `ctx.log` are documented in full, with parameters
and worked examples, in [utilities.md](utilities.md). In short:

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .hook("after-install", async ({ installedDir }) => {
      await ctx.replaceInFile(`${installedDir}/config.toml`, /theme = ".*"/, 'theme = "dark"');
      const versionDir = ctx.resolve("tool-*-x86_64-*");
      ctx.log.info(`Configured ${versionDir}`);
    }),
);
```

## Directory Structure

```
${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/
├── 1.2.3/              # Versioned install directory
│   ├── tool            # Binary
│   └── share/          # Assets
└── current -> 1.2.3    # Stable symlink (ctx.currentDir)
```

- Archives extracted to `binaries/tool-name/version/`
- `current` symlink updated after install
- Shims in `targetDir` execute `${ctx.currentDir}/binary`

## Path Resolution by Method

| Method                | Path            | Resolution                        |
| --------------------- | --------------- | --------------------------------- |
| `.symlink(src, dest)` | `src` with `./` | Relative to tool config directory |
| `.symlink(src, dest)` | `dest`          | Absolute path (`~` expanded)      |
| `.completions(path)`  | `path`          | Relative to extracted archive     |
| `binaryPath`          | github/cargo    | Relative to extracted archive     |
| `binaryPath`          | manual          | Absolute path                     |

## Common Mistakes

```typescript builder
// ❌ Hardcoded paths
.symlink('./config', '/home/user/.config/tool')

// ✅ Use tilde expansion
.symlink('./config', '~/.config/tool')

// ❌ Shell variable references
.zsh((shell) => shell.always(`source $DOTFILES/init.zsh`))

// ✅ Use context
.zsh((shell) => shell.always(`source "${ctx.currentDir}/init.zsh"`))
```

## Cross-Platform

Always use forward slashes - context variables handle platform differences:

```typescript builder
// Works on all platforms
.symlink('./config.toml', '~/.config/tool/config.toml')
```
