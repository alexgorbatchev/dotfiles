# @dotfiles/installer-apt

Installer plugin for Debian-family Linux packages installed with APT.

## Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("apt", {
    package: "ripgrep",
  }).bin("rg"),
);
```

## Parameters

- `package` (optional): APT package name. Defaults to the tool name.
- `version` (optional): Exact package version, passed to APT as `package=version`.
- `update` (optional): Run `apt-get update` before installation. Defaults to `false`.
- `env` (optional): Environment variables for the installation process.
- `hooks` (optional): Lifecycle hooks.

## Sudo

APT commonly requires root privileges. Add `.sudo()` when the target environment needs elevated installation:

```typescript
export default defineTool((install) =>
  install("apt", {
    package: "ripgrep",
    update: true,
  })
    .bin("rg")
    .sudo(),
);
```

## Implementation Details

1. Optionally runs `apt-get update` when `update: true`.
2. Runs `apt-get install -y <package>` or `apt-get install -y <package>=<version>`.
3. Resolves configured binaries from `PATH`.
4. Reads installed version with `dpkg-query -W -f=${Version}`.

This plugin is externally managed. APT owns package files and binary placement.
