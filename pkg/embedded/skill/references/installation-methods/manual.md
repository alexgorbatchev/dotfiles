# manual

Installs files from your tool configuration directory (custom scripts, pre-built binaries) or registers configuration-only tools. The `manual` method can be called with or without params.

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

// Install a custom script
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./scripts/my-tool.sh",
  }).bin("my-tool"),
);
```

```typescript
// Without params (shell-only or dependency wrapper)
export default defineTool((install) =>
  install("manual")
    .bin("tokscale")
    .dependsOn("bun")
    .zsh((shell) =>
      shell.functions({
        tokscale: `bun x tokscale@latest`,
      }),
    ),
);
```

```typescript
// Configuration-only tool (no binary)
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la" })));
```

## When to Use

Use `install("manual", { binaryPath })` for binaries that ship with your dotfiles:

- You have custom scripts or binaries to include with your dotfiles
- You want the system to manage and version your tool files
- You need shims generated for your custom tools
- You want to distribute pre-built binaries with your dotfiles

Use `install()` with no arguments for configuration-only tools:

- You only need shell configuration (aliases, environment, symlinks)
- Tools are managed entirely outside the dotfiles system
- You don't want any binary installation or management

A tool installed by a script that picks its own location (such as
`https://claude.ai/install.sh`, which installs into `~/.local/bin`) is not a `manual` tool
with the script run from a hook. Use `curl-script` with `binaryPath`, which downloads and
runs the script itself and links the binary to where the script put it; see
[Scripts That Install Themselves](curl-script.md#scripts-that-install-themselves).

## Parameters

| Parameter    | Type      | Required | Description                                                             |
| ------------ | --------- | -------- | ----------------------------------------------------------------------- |
| `binaryPath` | `string`  | No       | Path to the binary; see [binaryPath Resolution](#binarypath-resolution) |
| `symlink`    | `boolean` | No       | If `true`, symlinks to `binaryPath` instead of copying files            |

### binaryPath Resolution

`binaryPath` is resolved in this order:

1. Placeholders such as `{paths.homeDir}` are filled from the project configuration. A
   placeholder nothing can fill fails the installation, naming the tool and the value.
2. A leading `~` is the project's `paths.homeDir`.
3. A path that is still relative is taken relative to the `.tool.ts` file, or to
   `paths.dotfilesDir` for a configuration that has no tool file.

Symlinks are not followed: the result is the path as written. The generated shim runs
the same resolved path, so the installer and the shim cannot disagree about it.

## Examples

### Pre-built Binary

```typescript
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./binaries/linux/x64/custom-tool",
  }).bin("custom-tool"),
);
```

### Configuration-Only Tool

```typescript
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la", la: "ls -A" })));
```

### With Shell Configuration

```typescript
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./bin/my-tool.sh",
  })
    .bin("my-tool")
    .zsh((shell) => shell.aliases({ mt: "my-tool" }).completions("./completions/_my-tool")),
);
```

### With Sudo Prompt

```typescript
export default defineTool((install) =>
  install("manual", {
    binaryPath: "/usr/bin/whoami",
  })
    .bin("sudo-prompt-test")
    .sudo(),
);
```

**Notes:**

- Binary paths are relative to the tool configuration file location
- Files are copied to the managed installation directory with executable permissions
- `.sudo()` acquires sudo credentials interactively before Dotfiles registers the manual binary
- A `before-install` hook can stage files into `stagingDir` in place of `binaryPath`; if it leaves the staging directory empty the installation fails rather than producing an empty payload (see [lifecycle-hooks.md](../api-reference/lifecycle-hooks.md))
- Configuration-only tools use `install()` with no arguments and must not define `.bin()`
