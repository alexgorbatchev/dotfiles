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

## Update Checks

An update check first confirms the package is installed with `rpm -q`, then runs `dnf check-update --setopt=*.skip_if_unavailable=False <package>`. dnf exits 100 and lists the package when an upgrade is available, and exits 0 when there is none; its verdict decides, since RPM versions are not semantic versions. The `--setopt` makes a repository that cannot be reached fail the query, even one configured with `skip_if_unavailable`, because the package's upgrade could be in it. For a tool dotfiles installed, a package that is no longer installed, an unreachable repository, or any other exit status fails the check. A tool dotfiles never installed is not checked; [`tool check`](../getting-started/cli-reference.md#dotfiles-tool-check-tool) reports it as not installed.

## Platform Support

| Platform | Support                       |
| -------- | ----------------------------- |
| Linux    | RPM-family distributions only |
| macOS    | Not supported                 |
| Windows  | Not supported                 |
