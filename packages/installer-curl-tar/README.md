# @dotfiles/installer-curl-tar

Installer plugin for tools distributed as tarball archives via direct download URLs.

## Overview

This plugin provides installation capabilities for CLI tools distributed as tar archives (.tar, .tar.gz, .tgz) that can be downloaded directly from a URL. It handles downloading, extracting, and setting up binaries from the archive.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from "@dotfiles/cli";

export default defineTool((install, ctx) =>
  install("curl-tar", {
    url: "https://example.com/releases/tool-1.0.0.tar.gz",
  }).bin("tool"),
);
```

### Parameters

The `install('curl-tar', params)` function accepts the following parameters:

- **url** (required): The URL of the tarball to download (must be a valid HTTP/HTTPS URL)
- **versionArgs** (optional): Arguments to pass to the binary to check the version
- **versionRegex** (optional): Regex to extract version from output (`string` or `RegExp`)
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`beforeInstall`, `afterDownload`, `afterExtract`, `afterInstall`)

### Examples

#### Basic Tarball Installation

```typescript
export default defineTool((install, ctx) =>
  install("curl-tar", {
    url: "https://example.com/tool.tar.gz",
  }).bin("tool"),
);
```

#### With Version Detection

```typescript
export default defineTool((install, ctx) =>
  install("curl-tar", {
    url: "https://example.com/tool.tar.gz",
    versionArgs: ["--version"],
    versionRegex: /tool (\d+\.\d+\.\d+)/,
  }).bin("tool"),
);
```

#### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install("curl-tar", {
    url: "https://example.com/tool.tar.gz",
  })
    .bin("tool")
    .hooks({
      afterExtract: async (ctx) => {
        // Post-extraction setup
      },
    }),
);
```

#### Binary in Subdirectory

```typescript
export default defineTool(
  (install, ctx) =>
    install("curl-tar", {
      url: "https://example.com/tool.tar.gz",
    }).bin("tool", "bin/tool"), // Pattern to find binary
);
```

## Features

### Archive Download

Downloads tar archives from any accessible URL with progress display and force-download support.

### Archive Extraction

Automatically extracts tar archives (.tar, .tar.gz, .tgz) to the installation directory using the injected archive extractor.

### Binary Location

Supports flexible binary locations within archives:

- Root-level binaries
- Binaries in subdirectories (e.g., `bin/tool`)
- Multiple binaries per archive

### Lifecycle Hooks

Supports two installation lifecycle hooks:

- **afterDownload**: Executed after tarball download, before extraction
- **afterExtract**: Executed after extraction, before binary setup

### Archive Cleanup

Automatically removes the downloaded tarball after successful extraction to conserve disk space.

## Implementation Details

### Installation Process

1. Downloads the tarball from the specified URL
2. Executes afterDownload hook if configured
3. Extracts the archive to the installation directory
4. Executes afterExtract hook if configured
5. Locates and sets up binaries from the extracted content
6. Cleans up the downloaded archive

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `curl-tar`
- **Schemas**: `curlTarInstallParamsSchema`, `curlTarToolConfigSchema`
- **Update Check**: Not supported (direct URLs don't provide version information)
- **Update Tool**: Not supported
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "curl-tar": CurlTarInstallParams;
  }
  interface IToolConfigRegistry {
    "curl-tar": CurlTarToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"curl-tar", CurlTarInstallResult> {}
}
```

## Result Type

Installation returns `CurlTarInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to installed binaries
  version?: string,            // Optional version string if available
  metadata: {
    method: 'curl-tar',
    tarballUrl: string
  }
}
```

## Limitations

- No update checking capabilities
- Requires explicit binary paths if binaries are not in standard locations
- No automatic version extraction from URLs
