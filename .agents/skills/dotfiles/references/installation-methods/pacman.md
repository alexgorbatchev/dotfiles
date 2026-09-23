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

## Update Checks

An update check runs `pacman -Qu <package>`, which compares the installed package with the local sync database, so it is only as current as the last `pacman -Sy`. A listed upgrade means the tool is outdated. pacman exits 1 both when there is no upgrade and when the query fails, so only exit status 1 with no output at all counts as up to date. For a tool dotfiles installed, a package that is no longer installed, or a sync database that was never downloaded, fails the check. A tool dotfiles never installed is not checked; [`tool check`](../getting-started/cli-reference.md#dotfiles-tool-check-tool) reports it as not installed.

## Platform Support

| Platform | Support                        |
| -------- | ------------------------------ |
| Linux    | Arch-family distributions only |
| macOS    | Not supported                  |
| Windows  | Not supported                  |
