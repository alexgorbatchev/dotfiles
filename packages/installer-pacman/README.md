# @dotfiles/installer-pacman

Installer plugin for Arch-family Linux packages installed with pacman.

## Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("pacman", {
    package: "ripgrep",
  })
    .bin("rg")
    .sudo(),
);
```

## Parameters

- `package` (optional): pacman package target. Defaults to the tool name.
- `version` (optional): Exact package version requirement, passed to pacman as `package=version`.
- `sysupgrade` (optional): Use `pacman -Syu` instead of `pacman -S`. Defaults to `false`.
- `env` (optional): Environment variables for the installation process.
- `hooks` (optional): Lifecycle hooks.

## Sudo

pacman commonly requires root privileges. Add `.sudo()` when the target environment needs elevated installation:

```typescript
export default defineTool((install) =>
  install("pacman", {
    package: "ripgrep",
    sysupgrade: true,
  })
    .bin("rg")
    .sudo(),
);
```

## Implementation Details

1. Runs `pacman -S --needed --noconfirm <package>` by default.
2. Runs `pacman -Syu --needed --noconfirm <package>` when `sysupgrade: true`.
3. Resolves configured binaries from `PATH`.
4. Uses the configured exact `version` when provided; otherwise reads installed version with `pacman -Q`.

This plugin is externally managed. pacman owns package files and binary placement.
