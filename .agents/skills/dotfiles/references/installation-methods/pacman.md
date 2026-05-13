# pacman

Install Arch-family Linux packages using pacman.

pacman-installed tools are externally managed. The system package manager owns package files and binary placement. Use `.bin()` only to tell dotfiles which executable names should be resolved from `PATH` after installation.

## Basic Usage

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

| Parameter    | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `package`    | pacman package target (defaults to tool name)                |
| `version`    | Exact package version, installed as `package=version`        |
| `sysupgrade` | Run `pacman -Syu` instead of `pacman -S` (defaults to false) |
| `env`        | Environment variables (static or dynamic function)           |
| `hooks`      | Lifecycle hooks                                              |

## Examples

### Exact Version

```typescript
install("pacman", {
  package: "ripgrep",
  version: "13.0.0-1",
}).bin("rg");
```

### Upgrade System Before Syncing Package

```typescript
install("pacman", {
  package: "ripgrep",
  sysupgrade: true,
}).bin("rg");
```

## Platform Support

| Platform | Support                        |
| -------- | ------------------------------ |
| Linux    | Arch-family distributions only |
| macOS    | Not supported                  |
| Windows  | Not supported                  |
