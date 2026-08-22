# dnf

Install RPM-family Linux packages using DNF.

DNF-installed tools are externally managed. The system package manager owns package files and binary placement. Use `.bin()` only to tell dotfiles which executable names should be resolved from `PATH` after installation.

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
| `env`     | Environment variables (static or dynamic function)           |

## Examples

### Exact Version

```typescript
install("dnf", {
  package: "ripgrep",
  version: "13.0.0-1.fc40",
}).bin("rg");
```

### Refresh Metadata First

```typescript
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
