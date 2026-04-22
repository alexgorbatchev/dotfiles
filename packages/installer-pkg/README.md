# @dotfiles/installer-pkg

Installer plugin for macOS `.pkg` installer packages.

## Overview

This plugin downloads a `.pkg` file, runs macOS `installer`, and then resolves declared binaries from the system after installation. On non-macOS platforms, installation is silently skipped.

## Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: "https://example.com/releases/my-tool.pkg",
    },
  }).bin("my-tool"),
);
```

### Parameters

The `install('pkg', params)` function accepts the following parameters:

- **source** (required): `.pkg` source definition
  - `type: 'url'` with `url`
  - `type: 'github-release'` with `repo`, optional `version`, `assetPattern`, `assetSelector`, `ghCli`, `prerelease`
- **target** (optional): Target volume passed to `installer -target`. Defaults to `'/'`.
- **binaryPath** (optional): Absolute path to the primary installed binary. When omitted, declared `.bin()` names are resolved with `command -v` after installation.
- **versionArgs** (optional): Arguments to pass to the binary to check the version
- **versionRegex** (optional): Regex to extract version from output (`string` or `RegExp`)

## Notes

- This installer is macOS-only and silently skips elsewhere.
- Packages may require administrator privileges depending on where they install.
- For GUI-only packages, omit `.bin()`.
