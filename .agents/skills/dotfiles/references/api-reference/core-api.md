# API Reference

Reference for the public API available in `@alexgorbatchev/dotfiles`.

## Exports

```typescript
import {
  Architecture, // Architecture enum
  dedentString, // Utility function and tagged template for dedenting
  dedentTemplate, // Alias of dedentString for tagged template dedenting
  defineConfig, // Create project configuration
  defineTool, // Create tool configurations
  Platform, // Platform enum for cross-platform configs
} from "@alexgorbatchev/dotfiles";

import type {
  ConfigFactory,
  IConfigContext,
  IHookContext,
  IInstallFunction,
  IPlatformConfigBuilder,
  IPlatformInstallFunction,
  IToolConfigBuilder,
  IToolConfigContext,
} from "@alexgorbatchev/dotfiles";
```

Authoring helper types used by `defineTool` callbacks are also exported from the top-level package, including:

- `ConfigFactory`
- `IConfigContext`
- `IInstallFunction`
- `IPlatformInstallFunction`
- `IToolConfigBuilder`
- `IPlatformConfigBuilder`
- `IToolConfigContext`
- `IHookContext` (the context every lifecycle hook receives)

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

| Method                 | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `.bin(name, pattern?)` | Define binary name(s) and optional match pattern (`string \| RegExp`) |
| `.version(v)`          | Set version (`'latest'` or specific)                                  |
| `.dependsOn(...bins)`  | Declare binary dependencies                                           |
| `.symlink(src, dest)`  | Create config file symlink                                            |
| `.hook(event, fn)`     | Lifecycle hooks (details in Hooks section)                            |
| `.zsh(fn)`             | Zsh shell configuration                                               |
| `.bash(fn)`            | Bash shell configuration                                              |
| `.powershell(fn)`      | PowerShell configuration                                              |
| `.platform(p, fn)`     | Platform-specific overrides                                           |
| `.sudo()`              | Require an interactive sudo step during install                       |
| `.disable()`           | Skip tool during generation (logs warning)                            |
| `.hostname(pattern)`   | Restrict tool to specific hostname(s) (`string \| RegExp`)            |

#### `.bin(name)` runtime behavior

Declaring `.bin(name)` generates a shim for `name` in `paths.targetDir`. The one exception is a `manual` tool with neither `binaryPath` nor a `before-install` hook: nothing could ever place a binary where the shim would point, so no shim is written and `dotfiles generate` warns; such a command comes from shell functions instead (see [manual.md](../installation-methods/manual.md)).

- Running the shim auto-installs the tool on first use (if needed)
- Running `{binary} @update` triggers a shim-driven update flow
- Shim executions append usage events to a local log for dashboard analytics
- Removing a `.bin(name)` declaration and rerunning `dotfiles generate` cleans up the stale shim automatically

Usage tracking is enabled by default. The dashboard imports and compacts the local usage log into SQLite on startup. Set `DOTFILES_LOCAL_USAGE_TRACKING=0` to disable tracking.

### Base Install Parameters

Every installation method accepts this parameter in addition to its own:

| Parameter | Type      | Description                                                   |
| --------- | --------- | ------------------------------------------------------------- |
| `auto`    | `boolean` | Install during `dotfiles generate` as well (default: `false`) |

When `auto: true`, the tool is installed during `dotfiles generate` without requiring a separate `dotfiles install` step, together with the tools it depends on.

Lifecycle hooks are registered with `.hook()` (see [lifecycle-hooks.md](lifecycle-hooks.md)), not through an install parameter. An `env` parameter exists only for `curl-script`, whose installer runs a script; see [curl-script.md](../installation-methods/curl-script.md).

### Shell Configuration

The shell methods (`.zsh`, `.bash`, `.powershell`) receive a configurator:

```typescript builder
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

| Shell Method                   | Description                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `.completions(path \| config)` | Completion file, or `{ cmd }` run against the installed binary (generated after install only)                    |
| `.env(obj)`                    | Environment variables (PATH prohibited - use `.path()`)                                                          |
| `.path(dir)`                   | Add directory to PATH (deduplicated)                                                                             |
| `.aliases(obj)`                | Shell aliases                                                                                                    |
| `.functions(obj)`              | Shell functions                                                                                                  |
| `.sourceFile(path)`            | Source a file (skips if missing)                                                                                 |
| `.sourceFunction(name)`        | Source output of a function defined via `.functions()`                                                           |
| `.always(script)`              | Script run on every shell init                                                                                   |
| `.once(script)`                | Script written to a generated once-file, attributed to its `.tool.ts` source, then removed after first execution |

**Completions examples:**

```typescript shell
.completions('completions/_tool')                    // Static path (relative to toolDir)
.completions(`${ctx.currentDir}/completions/_tool`)  // Absolute path (from extracted archive)
.completions({ cmd: 'tool completion zsh' })         // Generated by running the installed binary
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

| Value              | Description     |
| ------------------ | --------------- |
| `Platform.Linux`   | Linux systems   |
| `Platform.MacOS`   | macOS           |
| `Platform.Windows` | Windows systems |

## Architecture

Enum for architecture-specific configurations.

| Value                 | Description                      |
| --------------------- | -------------------------------- |
| `Architecture.X86_64` | Intel/AMD 64-bit                 |
| `Architecture.Arm64`  | ARM 64-bit (Apple Silicon, etc.) |
