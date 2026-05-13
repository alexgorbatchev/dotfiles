# @dotfiles/installer-dnf

Installer plugin for RPM-family Linux packages installed with DNF.

## Usage

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

- `package` (optional): DNF package spec. Defaults to the tool name.
- `version` (optional): Exact version/release suffix, passed to DNF as `package-version`.
- `refresh` (optional): Run `dnf makecache` before installation. Defaults to `false`.
- `env` (optional): Environment variables for the installation process.
- `hooks` (optional): Lifecycle hooks.

## Sudo

DNF commonly requires root privileges. Add `.sudo()` when the target environment needs elevated installation:

```typescript
export default defineTool((install) =>
  install("dnf", {
    package: "ripgrep",
    refresh: true,
  })
    .bin("rg")
    .sudo(),
);
```

## Implementation Details

1. Optionally runs `dnf makecache` when `refresh: true`.
2. Runs `dnf install -y <package>` or `dnf install -y <package>-<version>`.
3. Resolves configured binaries from `PATH`.
4. Uses the configured exact `version` when provided; otherwise reads installed version with `rpm -q --qf %{VERSION}-%{RELEASE}`.

This plugin is externally managed. DNF owns package files and binary placement.
