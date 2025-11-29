# @dotfiles/installer-curl-script

Installer plugin for tools distributed via downloadable shell installation scripts.

## Overview

This plugin provides installation capabilities for CLI tools that use shell scripts for installation (e.g., `curl -fsSL https://example.com/install.sh | sh`). It downloads the script and executes it using a specified shell interpreter.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .bin('tool')
);
```

### Parameters

The `install('curl-script', params)` function accepts the following parameters:

- **url** (required): The URL of the installation script to download (must be a valid HTTP/HTTPS URL)
- **shell** (required): The shell to use for executing the script (must be either `'bash'` or `'sh'`)
- **args** (optional): Arguments to pass to the script. Can be an array of strings or a function returning an array of strings (sync or async).
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`beforeInstall`, `afterDownload`)

### Examples

#### Basic Script Installation

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .bin('tool')
);
```

#### With Environment Variables

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
    env: {
      INSTALL_DIR: '$HOME/.local/bin',
    },
  })
    .bin('fly')
);
```

#### With Arguments and Context

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    // Static arguments
    args: ['--verbose', '--install-dir', '/usr/local/bin'],
  })
    .bin('tool')
);
```

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    // Dynamic arguments with context
    args: (context) => [
      '--install-dir',
      context.installDir,
      '--platform',
      context.projectConfig.platform
    ],
  })
    .bin('tool')
);
```

#### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://fly.io/install.sh',
    shell: 'sh',
    env: {
      INSTALL_DIR: '$HOME/.local/bin',
    },
  })
    .bin('fly')
);
```

#### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .bin('tool')
    .hooks({
      afterDownload: async (ctx) => {
        // Verify script before execution
      },
    })
);
```

## Features

### Shell Script Execution
Downloads shell installation scripts and executes them with the specified interpreter, supporting both bash and sh shells.

### Hook Support
Supports the afterDownload lifecycle hook, enabling custom logic after script download but before execution.

### Binary Management
After script execution, handles copying installed binaries from system locations (e.g., `/usr/local/bin`) to the tool's versioned installation directory.

### Progress Display
Integrates with the downloader to display download progress for the installation script.

## Implementation Details

### Installation Process

1. Downloads the installation script from the specified URL
2. Makes the script executable (chmod 0755)
3. Executes afterDownload hook if configured
4. Executes the script using the specified shell (bash or sh)
5. Locates installed binaries and copies them to the versioned directory

Note: The actual script execution is currently simulated in the implementation.

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `curl-script`
- **Schemas**: `curlScriptInstallParamsSchema`, `curlScriptToolConfigSchema`
- **Update Check**: Not supported (scripts don't provide version information)
- **Update Tool**: Not supported
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'curl-script': CurlScriptInstallParams;
  }
  interface IToolConfigRegistry {
    'curl-script': CurlScriptToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'curl-script', CurlScriptInstallResult> {}
}
```

## Result Type

Installation returns `CurlScriptInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to installed binaries
  metadata: {
    method: 'curl-script',
    scriptUrl: string,
    shell: string
  }
}
```

## Limitations

- Script execution is currently simulated (not fully implemented)
- No version detection or update checking capabilities
- Binary location detection assumes standard system paths
