# pacman

Install Arch-family Linux packages using pacman.

pacman-installed tools are externally managed: pacman owns the files, and `.bin()` names the executables the package provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

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

## Examples

### Exact Version

```typescript body
install("pacman", {
  package: "ripgrep",
  version: "13.0.0-1",
}).bin("rg");
```

The `version` parameter takes precedence over `.version()`, and `dotfiles update` refuses a tool it pins ([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

### Upgrade System Before Syncing Package

```typescript body
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
