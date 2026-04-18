# @dotfiles/installer-manual

Installer plugin for tools that are manually installed or require custom setup procedures.

## Overview

This plugin provides support for tools that cannot be automatically installed through package managers or download mechanisms. It handles scenarios where binaries are already present on the system, included in the dotfiles repository, or require user-managed installation.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from "@dotfiles/cli";

// For existing system tools
export default defineTool((install, ctx) =>
  install() // Manual-style tool config (add .bin() if you want shims)
    .bin("existing-tool"),
);

// Explicit manual method without params
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

// With binary path
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "~/dotfiles/bin/custom-tool",
  }).bin("custom-tool"),
);
```

### Parameters

The `install('manual', params)` function accepts the following parameters:

- **binaryPath** (optional): Path to an existing binary file relative to the tool configuration file location. Supports path expansion using `~` and environment variables.
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`'before-install'`, `'after-install'`)

If `binaryPath` is not specified, the plugin only processes shell configurations and symlinks without binary installation.

### Examples

#### Configuration-Only Tool

```typescript
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la" })));
```

#### With Binary Path

```typescript
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "~/dotfiles/bin/tool",
  }).bin("tool"),
);
```

#### Existing System Tool

```typescript
export default defineTool((install, ctx) =>
  install()
    .bin("docker")
    .zsh((shell) => shell.completions("_docker")),
);
```

#### With Sudo Prompt

```typescript
export default defineTool((install) =>
  install("manual", {
    binaryPath: "/usr/bin/whoami",
  })
    .bin("sudo-prompt-test")
    .sudo(),
);
```

## Features

### Binary Verification

Checks that the specified binary path exists before attempting to copy it to the installation directory.

### Path Expansion

Supports path expansion for the `binaryPath` parameter:

- Home directory expansion (`~`)
- Environment variable substitution
- Relative paths from tool configuration file location

### Binary Relocation

Copies binaries from source locations to the versioned installation directory, enabling consistent binary management across all installation methods.

### Single Binary Support

Currently supports one binary per tool when using `binaryPath`. Multiple binaries in configuration will log a warning and only process the first one.

### Minimal Installation

Does not perform downloads, extractions, or complex setup procedures. Focuses on binary registration and path management.

## Implementation Details

### Installation Process

1. If `binaryPath` is specified, verifies the binary exists
2. Copies the binary to the versioned installation directory
3. Sets appropriate executable permissions (0755)
4. Returns the configured binary paths

No download, extraction, or automated setup is performed.
When `.sudo()` is set on the tool, Dotfiles acquires sudo credentials interactively before continuing the manual registration step.

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `manual`
- **Schemas**: `manualInstallParamsSchema`, `manualToolConfigSchema`
- **Update Check**: Not supported (manual installations don't track versions)
- **Update Tool**: Not supported
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    manual: ManualInstallParams;
  }
  interface INoParamsMethodRegistry {
    manual: true;
  }
  interface IToolConfigRegistry {
    manual: ManualToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"manual", ManualInstallResult> {}
}
```

## Result Type

Installation returns `ManualInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to installed binaries (empty if no binaryPath specified)
  metadata: {
    method: 'manual',
    manualInstall: true
  }
}
```

## Use Cases

### Pre-installed Tools

For system tools or binaries installed via other means that need to be registered in the dotfiles system.

### Custom Scripts

For custom shell scripts or binaries stored within the dotfiles repository itself.

### Fallback Option

When no automatic installation method is available or appropriate for a particular tool.

### Configuration-Only Tools

Configuration-only (shell-only) tools should not use the manual installer. Define them with `install()` (no args) and shell
configuration methods (e.g. `.zsh(...)`) without calling `.bin()`.

## Limitations

- No version tracking or update checking
- No download or extraction capabilities
- Single binary support when using `binaryPath`
- Requires manual user intervention for actual tool installation
- Only `before-install` and `after-install` hooks are available (no `after-download` or `after-extract` since there's no download/extract phase)
