# dnf

Install RPM-family Linux packages using DNF.

DNF-installed tools are externally managed: DNF owns the files, and `.bin()` names the executables the package provides so dotfiles can shim them (see [`.bin()` runtime behavior](../api-reference/core-api.md#binname-runtime-behavior)).

## Basic Usage

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("dnf", {
    package: "ripgrep",
  })
    .bin("rg")
    .sudo(),
);
```

## Parameters

| Parameter | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `package` | DNF package spec (defaults to tool name)                     |
| `version` | Exact version/release suffix, installed as `package-version` |
| `refresh` | Run `dnf makecache` before install (defaults to false)       |

## Examples

### Exact Version

```typescript body
install("dnf", {
  package: "ripgrep",
  version: "13.0.0-1.fc40",
}).bin("rg");
```

The `version` parameter takes precedence over `.version()`, and `dotfiles update` refuses a tool it pins ([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

### Refresh Metadata First

```typescript body
install("dnf", {
  package: "ripgrep",
  refresh: true,
}).bin("rg");
```

## Platform Support

| Platform | Support                       |
| -------- | ----------------------------- |
| Linux    | RPM-family distributions only |
| macOS    | Not supported                 |
| Windows  | Not supported                 |
