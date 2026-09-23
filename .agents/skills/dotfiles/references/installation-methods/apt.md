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

The `version` parameter takes precedence over `.version()`, and `dotfiles update` refuses a tool it pins ([`tool update`](../getting-started/cli-reference.md#dotfiles-tool-update-tool)).

### Refresh Package Lists First

```typescript body
install("apt", {
  package: "ripgrep",
  update: true,
}).bin("rg");
```

## Update Checks

An update check runs `apt-cache policy <package>` in the C locale, since apt translates the labels it prints. It compares the `Installed:` version with the `Candidate:` version, the one `apt-get install` would pick from the local package lists, so the check is only as current as the last `apt-get update`. The tool is outdated exactly when the two differ; apt's answer decides, since Debian versions are not semantic versions. `apt-cache policy` exits 0 for a package that is not installed (it prints `Installed: (none)`, also for a package removed with its configuration files kept) and for a name apt does not know, so either fails the check. For an unknown name apt prints nothing, or, when the name reads as a regular expression (such as `perl-bas.` or `libstdc++`), the packages that match it. Only the section for the package itself counts, so a misspelled name fails the check rather than reporting another package's versions. An installed package with no candidate, as when every version is pinned below zero, and a query that fails also fail the check ([`tool check`](../getting-started/cli-reference.md#dotfiles-tool-check-tool)).

## Platform Support

| Platform | Support                          |
| -------- | -------------------------------- |
| Linux    | Debian-family distributions only |
| macOS    | Not supported                    |
| Windows  | Not supported                    |
