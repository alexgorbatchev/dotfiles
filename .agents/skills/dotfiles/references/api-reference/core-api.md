# API Reference

Reference for the public API available in `@alexgorbatchev/dotfiles`.

## Exports

```typescript
import {
  Architecture, // Architecture enum
  dedentString, // Utility for template strings
  dedentTemplate, // Tagged template for dedenting
  defineConfig, // Create project configuration
  defineTool, // Create tool configurations
  Platform, // Platform enum for cross-platform configs
} from "@alexgorbatchev/dotfiles";
```

## defineTool

Creates a tool configuration.

```typescript
export default defineTool((install, ctx) => install("github-release", { repo: "owner/tool" }).bin("tool"));
```

### Parameters

- `install(method, params)` - Function to select installation method
- `install(method)` - Some methods (e.g. `manual`) can be called without params
- `install()` - Configuration-only tool (no installation method)
- `ctx` - Context object with `projectConfig`, `toolName`, `systemInfo`

### Builder Methods

| Method                | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `.bin(name)`          | Define binary name(s) to expose                         |
| `.version(v)`         | Set version (`'latest'` or specific)                    |
| `.dependsOn(...bins)` | Declare binary dependencies                             |
| `.symlink(src, dest)` | Create config file symlink                              |
| `.hook(event, fn)`    | Lifecycle hooks (details in Hooks section)              |
| `.zsh(fn)`            | Zsh shell configuration                                 |
| `.bash(fn)`           | Bash shell configuration                                |
| `.powershell(fn)`     | PowerShell configuration                                |
| `.platform(p, fn)`    | Platform-specific overrides                             |
| `.disable()`          | Skip tool during generation (logs warning)              |
| `.hostname(pattern)`  | Restrict tool to specific hostname(s) (string or regex) |

#### `.bin(name)` runtime behavior

Declaring `.bin(name)` generates a shim for `name` in `paths.targetDir`.

- Running the shim auto-installs the tool on first use (if needed)
- Running `{binary} @update` triggers a shim-driven update flow
- Shim executions are recorded for usage analytics via a private internal command

Usage tracking is non-blocking and enabled by default. Set `DOTFILES_USAGE_TRACKING=0` to disable tracking.

### Base Install Parameters

All installation methods support these parameters:

| Parameter | Type                                                        | Description                                               |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `env`     | `Record<string, string> \| (ctx) => Record<string, string>` | Environment variables for installation                    |
| `hooks`   | `object`                                                    | Lifecycle hooks configuration                             |
| `auto`    | `boolean`                                                   | Auto-install during `generate` (default: method-specific) |

> **Note**: The `auto` parameter defaults to `true` for `zsh-plugin` and `false` for all other installation methods. When `auto: true`, the tool is automatically installed during `dotfiles generate` without requiring a separate `dotfiles install` step.

The `env` parameter can be static or dynamic:

```typescript
// Static environment variables
install("github-release", {
  repo: "owner/tool",
  env: { CUSTOM_FLAG: "true" },
}).bin("tool");

// Dynamic environment variables (receives context with projectConfig, stagingDir)
install("github-release", {
  repo: "owner/tool",
  env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
}).bin("tool");
```

### Shell Configuration

The shell methods (`.zsh`, `.bash`, `.powershell`) receive a configurator:

```typescript
.zsh((shell) =>
  shell
    .completions('completions/_tool')
    .env({ VAR: 'value' })
    .aliases({ t: 'tool' })
    .always(/* zsh */`
      function my-func() { tool "$@"; }
    `)
)
```

| Shell Method                               | Description                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `.completions(path \| config \| callback)` | Completion file, config object, or callback with `ctx.version` (generated after install only) |
| `.env(obj)`                                | Environment variables (PATH prohibited - use `.path()`)                                       |
| `.path(dir)`                               | Add directory to PATH (deduplicated)                                                          |
| `.aliases(obj)`                            | Shell aliases                                                                                 |
| `.functions(obj)`                          | Shell functions                                                                               |
| `.sourceFile(path)`                        | Source a file (skips if missing)                                                              |
| `.sourceFunction(name)`                    | Source output of a function defined via `.functions()`                                        |
| `.always(script)`                          | Script run on every shell init                                                                |
| `.once(script)`                            | Script run once after install                                                                 |

**Completions examples:**

```typescript
.completions('completions/_tool')                    // Static path (relative to toolDir)
.completions(`${ctx.currentDir}/completions/_tool`)  // Absolute path (from extracted archive)
.completions({ cmd: 'tool completion zsh' })         // Dynamic via command
.completions({ url: 'https://.../completions.tar.gz', source: `${ctx.currentDir}/_tool` })  // Archive URL
```

## defineConfig

Creates project configuration. See Project Configuration section.

```typescript
export default defineConfig(() => ({
  paths: { dotfilesDir: "~/.dotfiles" },
}));
```

## Platform

Enum for platform-specific configurations.

```typescript
import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .platform(Platform.MacOS, (install) => install("brew", { formula: "tool" })),
);
```

| Value              | Description                      |
| ------------------ | -------------------------------- |
| `Platform.Linux`   | Linux systems                    |
| `Platform.MacOS`   | macOS (alias: `Platform.Darwin`) |
| `Platform.Windows` | Windows systems                  |

## Architecture

Enum for architecture-specific configurations.

| Value                 | Description                      |
| --------------------- | -------------------------------- |
| `Architecture.X86_64` | Intel/AMD 64-bit                 |
| `Architecture.Arm64`  | ARM 64-bit (Apple Silicon, etc.) |
