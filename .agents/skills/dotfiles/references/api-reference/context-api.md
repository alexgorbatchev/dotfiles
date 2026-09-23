# Context API

The `ctx` parameter in `defineTool` provides access to tool and project information.

## Properties

| Property            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `ctx.toolName`      | Name of the tool being configured                 |
| `ctx.toolDir`       | Directory containing the `.tool.ts` file          |
| `ctx.currentDir`    | Tool's stable `current` directory (after install) |
| `ctx.projectConfig` | Full project configuration                        |
| `ctx.systemInfo`    | Description of the target machine                 |
| `ctx.fs`            | File operations                                   |
| `ctx.replaceInFile` | Replace text in files using regex patterns        |
| `ctx.resolve`       | Resolve glob pattern to a single path             |
| `ctx.log`           | Logger for user-facing output                     |

### ctx.systemInfo

What the runtime reports about the machine a configuration is evaluated for. The same
object, of type `ISystemInfo`, is on the `defineConfig` context, on every
[hook context](lifecycle-hooks.md#context-properties) and on the context a function-valued
install parameter such as `assetSelector` receives. `platform`, `arch` and `libc`
follow the `--platform`, `--arch` and `--libc` flags when those are given, so a
configuration loaded for another target describes that target rather than the machine
running the CLI.

| Field      | Type           | Value                                                                                                                                                                                                                                                                                     |
| ---------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform` | `Platform`     | The operating system, as exactly one member: `Platform.Linux`, `Platform.MacOS` or `Platform.Windows`. An operating system with no member reports `0`, which equals none of them.                                                                                                         |
| `arch`     | `Architecture` | The CPU architecture, as exactly one member: `Architecture.X86_64` or `Architecture.Arm64`. An architecture with no member reports `0`, which equals none of them.                                                                                                                        |
| `libc`     | `string`       | The Linux C library, named the way release assets name it: `"gnu"`, `"musl"`, or `"unknown"` when it cannot be told apart. Always `"unknown"` off Linux. Compare against the `Libc` enum (`Libc.Gnu`, `Libc.Musl`, `Libc.Unknown`) rather than against a literal.                         |
| `homeDir`  | `string`       | The directory a `~` path resolves against. It is the project's `paths.homeDir`, which a configuration may deliberately point somewhere other than the invoking user's own home; inside `defineConfig`, where that value is still being defined, it is the invoking user's home directory. |
| `hostname` | `string`       | Name of the machine, the value `.hostname(pattern)` matches against. Empty when the machine cannot report one.                                                                                                                                                                            |

`platform` and `arch` hold members of the same `Platform` and `Architecture` enums that
`.platform()` blocks take (see [platform-specific.md](../configuration/platform-specific.md#platform-and-architecture-enums)).
They always hold a single member, never a combination such as `Platform.All`, so compare
them with `===`:

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) => {
  const { platform, arch } = ctx.systemInfo;
  const isAppleSilicon = platform === Platform.MacOS && arch === Architecture.Arm64;
  const prefix = isAppleSilicon ? "/opt/homebrew" : "/usr/local";
  return install("manual", { binaryPath: `${prefix}/bin/tool` }).bin("tool");
});
```

There is no `os` field and no `timestamp` field on `systemInfo`.

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

`ctx.fs`, `ctx.replaceInFile`, `ctx.resolve` and `ctx.log` are documented in full, with
parameters and worked examples, in [utilities.md](utilities.md) -- the file system
methods under [ctx.fs](utilities.md#ctxfs). In short:

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
| `.completions(path)`  | `path`          | Relative to tool config directory |

`binaryPath` means something different to each installation method that reads it; its
resolution is documented on each method's own page: [manual](../installation-methods/manual.md#binarypath-resolution),
[curl-script](../installation-methods/curl-script.md#scripts-that-install-themselves),
[dmg](../installation-methods/dmg.md) and [pkg](../installation-methods/pkg.md).

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
