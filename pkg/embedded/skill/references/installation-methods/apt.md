# apt

Install Debian-family Linux packages using APT.

APT-installed tools are externally managed: APT owns the files, and `.bin()` names the executables the package provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("apt", {
    package: "ripgrep",
  })
    .bin("rg")
    .sudo(),
);
```

## Parameters

| Parameter | Description                                             |
| --------- | ------------------------------------------------------- |
| `package` | APT package name (defaults to tool name)                |
| `version` | Exact package version, installed as `package=version`   |
| `update`  | Run `apt-get update` before install (defaults to false) |

## Examples

### Exact Version

```typescript body
install("apt", {
  package: "ripgrep",
  version: "13.0.0-1",
}).bin("rg");
```

### Refresh Package Lists First

```typescript body
install("apt", {
  package: "ripgrep",
  update: true,
}).bin("rg");
```

## Platform Support

| Platform | Support                          |
| -------- | -------------------------------- |
| Linux    | Debian-family distributions only |
| macOS    | Not supported                    |
| Windows  | Not supported                    |
