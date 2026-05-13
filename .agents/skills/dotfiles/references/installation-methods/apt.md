# apt

Install Debian-family Linux packages using APT.

APT-installed tools are externally managed. The system package manager owns package files and binary placement. Use `.bin()` only to tell dotfiles which executable names should be resolved from `PATH` after installation.

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
| `env`     | Environment variables (static or dynamic function)      |

## Examples

### Exact Version

```typescript
install("apt", {
  package: "ripgrep",
  version: "13.0.0-1",
}).bin("rg");
```

### Refresh Package Lists First

```typescript
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
