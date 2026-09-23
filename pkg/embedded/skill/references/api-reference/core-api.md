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

| Method                        | Description                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.bin(name, pattern?)`        | Define one binary, with an optional match pattern (`string \| RegExp`)                                |
| `.bin(name, options)`         | Same, with `{ pattern?, shim? }`; `shim: false` installs the binary without a PATH shim               |
| `.version(v)`                 | Set version (`'latest'` or specific)                                                                  |
| `.dependsOn(...bins)`         | Declare binary dependencies                                                                           |
| `.symlink(src, dest, opts?)`  | Link a file or directory into place ([details](shell-integration.md#symbolic-links))                  |
| `.copy(src, dest, opts?)`     | Copy a file or directory into place instead of linking it ([details](shell-integration.md#copies))    |
| `.ensureDir(path, opts?)`     | Ensure a directory exists with the declared permissions ([details](shell-integration.md#directories)) |
| `.block(target, opts)`        | Own a managed block region within a shared file ([details](shell-integration.md#managed-blocks))      |
| `.template(src, dest, opts?)` | Render a template file with 3-way drift resolution ([details](shell-integration.md#templates))        |
| `.updateCheck(config)`        | Record update-check settings on the tool (see below)                                                  |
| `.hook(event, fn)`            | Lifecycle hooks ([details](lifecycle-hooks.md))                                                       |
| `.shell(fn)`                  | Shell configuration across all supported shells (Zsh, Bash, PowerShell)                               |
| `.zsh(fn)`                    | Zsh shell configuration                                                                               |
| `.bash(fn)`                   | Bash shell configuration                                                                              |
| `.powershell(fn)`             | PowerShell configuration                                                                              |
| `.platform(p, fn)`            | Platform-specific overrides                                                                           |
| `.platform(p, a, fn)`         | Overrides for one platform and architecture                                                           |
| `.arch(a, fn)`                | Architecture-specific overrides, on any platform                                                      |
| `.sudo()`                     | Require an interactive sudo step during install                                                       |
| `.disable()`                  | Skip tool during generation (logs warning)                                                            |
| `.hostname(pattern)`          | Restrict tool to specific hostname(s) (`string \| RegExp`)                                            |

Every method above is also available inside a `.platform()` or `.arch()` callback, on
the `IPlatformConfigBuilder`, except `.platform()` and `.arch()` themselves: the blocks
do not nest.

`.depends()` is accepted as another spelling of `.dependsOn()`. Prefer `.dependsOn()`;
the two record the same thing.

A tool that is `.disable()`d, or whose `.hostname()` pattern does not match the machine,
is skipped with a warning, and whatever it generated before is removed on the next
`dotfiles generate` -- the configuration is kept, the artifacts are not.

#### `.bin(name)` runtime behavior

Declaring `.bin(name)` generates a shim for `name` in `paths.targetDir`. The one exception is a `manual` tool with neither `binaryPath` nor a `before-install` hook: nothing could ever place a binary where the shim would point, so no shim is written and `dotfiles generate` warns; such a command comes from shell functions instead (see [manual.md](../installation-methods/manual.md)).

Externally-managed installers (`apt`, `brew`, `dnf`, `dmg`, `npm`, `pacman`, `pkg`) follow the same rule: declare `.bin()` for every executable the package provides, exactly as for any other method. The shim targets `<binariesDir>/<tool>/current/<name>`; after installation dotfiles records where the package manager placed each binary (for example `/opt/homebrew/bin/htop`) and links `current/<name>` to it, so a shim run before installation installs the tool and then executes the freshly installed binary. dotfiles never guesses a system path such as `/usr/bin/<name>`.

- Running the shim auto-installs the tool on first use (if needed)
- Running `{binary} @update` triggers a shim-driven update flow
- Shim executions append usage events to a local log for dashboard analytics
- Removing a `.bin(name)` declaration and rerunning `dotfiles generate` cleans up the stale shim automatically
- `.bin(name, { shim: false })` declares the binary without a shim: it is installed under the tool's `current` directory and remains a `dependsOn()` target, but nothing is written to `paths.targetDir` (this is how the scaffolded `typescript.tool.ts` keeps `tsc` off PATH)
- During `dotfiles generate`, declared binaries, aliases, and functions are checked for shadowing against external system commands on PATH and shell builtins; see [Troubleshooting](../configuration/troubleshooting.md#shadow-warnings-during-generate)

Usage tracking is enabled by default. The dashboard imports and compacts the local usage log into SQLite on startup. Set `DOTFILES_LOCAL_USAGE_TRACKING=0` to disable tracking.

#### Binary patterns

For a method that unpacks an archive, the second argument of `.bin()` says where in the
unpacked tree the executable is. Without one, the pattern is `{,*/}<name>`: the binary at
the archive root or exactly one directory down.

A pattern is matched against each file's path relative to the archive root, with `*` and
`?` matching anything but `/`, `[abc]`, `[a-z]` and `[!abc]` character classes, and
nestable `{a,b}` alternation. `**`, numeric ranges such as `{1..3}` and extglob are not
supported, and directories never match.

| Pattern             | Matches                            |
| ------------------- | ---------------------------------- |
| `'tool'`            | Exactly `tool` at the archive root |
| `'*/bin/tool'`      | `tool` in any directory's `bin`    |
| `'tool-*/bin/tool'` | A versioned directory's `bin`      |

When several files match, the one that is executable and named after the binary wins,
then any executable, then a file named after the binary, then the first match in path
order.

#### `.copy(src, dest)`

Copies a file, or a directory and everything under it, to `dest`. A relative `src`
resolves against the directory holding the `.tool.ts`; `dest` is expanded like any other
path, so `~/` reaches the configured home directory.

```typescript builder
.copy('./config.toml', '~/.config/tool/config.toml')
```

Copies are applied by `dotfiles generate` and again by `dotfiles install`, so a target
that is edited afterwards is restored on the next run. Whatever already sits at the
target is kept as `<dest>.bak`, replacing an older backup; a target that already matches
the source is left alone, which is what keeps the first backup rather than displacing it
on every run. Removing the declaration removes the copy on the next `dotfiles generate`.

Use `.copy()` when the tool must own a real file -- something it rewrites in place, or a
program that refuses to follow a symlink -- and [`.symlink()`](shell-integration.md#symbolic-links)
otherwise, so edits stay in the dotfiles repository.

#### `.updateCheck(config)`

Records `{ enabled?: boolean, constraint?: string }` on the tool configuration.
Platform overrides merge it field by field.

`enabled: false` takes the tool out of update checks: `dotfiles tool check` skips it,
and the dashboard reports no update for it without asking the installer. Omitted, it is
checked.

`constraint` is a semver range (`^1.2.3`, `~1.2.0`, `>=1.0.0`, or an exact version) that
bounds which releases count as an available update. A release outside the range is still
reported as the latest version upstream, but not as an update: with `~1.2.0` installed at
`1.2.3`, `1.2.9` is an update and `1.3.0` is not.

Neither setting changes which version `dotfiles install` or `dotfiles update` installs.
To hold a tool at one version, pin it with `.version()`: `dotfiles install` installs that
version, and `dotfiles update` refuses the tool
([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

### Base Install Parameters

Every installation method accepts this parameter in addition to its own:

| Parameter | Type      | Description                                                   |
| --------- | --------- | ------------------------------------------------------------- |
| `auto`    | `boolean` | Install during `dotfiles generate` as well (default: `false`) |

When `auto: true`, the tool is installed during `dotfiles generate` without requiring a separate `dotfiles install` step, together with the tools it depends on.

Lifecycle hooks are registered with `.hook()` (see [lifecycle-hooks.md](lifecycle-hooks.md)), not through an install parameter. An `env` parameter exists only for `curl-script`, whose installer runs a script; see [curl-script.md](../installation-methods/curl-script.md).

### Shell Configuration

The shell methods (`.shell`, `.zsh`, `.bash`, `.powershell`) receive a configurator:

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
