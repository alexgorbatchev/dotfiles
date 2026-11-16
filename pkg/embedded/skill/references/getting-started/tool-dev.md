---
title: Development Tools
sidebar:
  order: 3
---

# Development Tools

Register a locally built executable when it should remain selected during routine
dotfiles maintenance. The tool's `.tool.ts` continues to describe its managed
installation; development selection is local state, not a version pin or a
`devMode` property in that file.

## Register a Build

```bash
dotfiles tool dev use my-tool --bin my-tool=./build/my-tool
```

The tool must be configured and enabled, and every binary declared by its
[`.bin()` configuration](../api-reference/core-api.md#binname-runtime-behavior)
must have exactly one mapping, including binaries declared with `shim: false`.
Missing, duplicate, and undeclared mappings are rejected. The `dotfiles` executable
may also be registered without a tool configuration to support initial bootstrap.
The command copies executable files into the development store and registers the
copies. Rebuilding or deleting the original build output does not change an active
copy; run `use` again to select a newer build.

```bash
dotfiles tool dev use my-tool \
  --bin my-tool=./build/my-tool \
  --bin my-tool-helper=./build/my-tool-helper \
  --source-repo . \
  --version dev-local
```

| Option                  | Meaning                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `--bin <name>=<source>` | Executable name and source file to copy. Repeat for additional binaries.                                 |
| `--source-repo <path>`  | Optional source repository metadata, stored as an absolute path; the directory is not required to exist. |
| `--version <string>`    | Optional development version metadata; it does not participate in managed release comparisons.           |

The store location is controlled by the optional
[`paths.devToolsDir` setting](../configuration/project-configuration.md#paths).
No project configuration change is needed to use the default location.

Source paths accept `~` and resolve relative to the command's working directory.
The tool argument accepts the same configured tool and binary names as
[`tool install`](cli-reference.md#dotfiles-tool-install-tool).

## Inspect Registrations

```bash
dotfiles tool dev list
```

Lists registered tools and their development builds. Registrations remain local
to the dotfiles project, so selecting a development build does not alter the
configuration shared with another machine.

- `--json`: Output development registrations in JSON format.

## Return to Managed Installation

```bash
dotfiles tool dev off my-tool
```

Explicitly disables the development registration and regenerates the tool's
ordinary shims. It does not install a release immediately: an existing managed
installation is selected again, or the shim installs on first use. Ordinary
managed maintenance behavior then applies to the tool again.

`off` also accepts an exact registered tool name after its configuration has been
removed or disabled. In that case it removes the inactive tool's managed artifacts
instead of restoring an active shim.

## Maintenance Behavior

While a tool has an active development registration:

- Its generated shims select the copied development executables, and generation
  preserves that selection.
- Install, update, and uninstall leave the tool protected, including with
  `--force`. Changing a version pin does not clear the registration.
- `tool check` does not query upstream for the tool, including with `--installed`.
  It reports `unsupported` with `error: "development override active"` and the
  registered version in JSON. Human output names the development override; agent
  output includes `error:"development override active"` instead of an installer.
- `tool which --bin` resolves the registered executable. If the tool configuration
  has been removed, the registration's exact tool name remains usable for this
  lookup.
- Orphan cleanup preserves it if the tool configuration is removed, disabled, or
  excluded on the current machine.
- `dotfiles self upgrade` preserves an active development registration for the
  `dotfiles` executable.
- A missing registered executable is an error. A shim does not reinstall a
  release or silently execute another copy from PATH. Register a rebuilt binary
  or disable the registration explicitly to recover.

Protection covers dotfiles operations. Manually deleting the development store
removes its contents like any other directory.

## Bootstrap Scripts

A bootstrap script should compile first, then call `tool dev use` with its build
output. Copying a development executable into a managed release's `current`
directory does not register ownership and allows later maintenance to replace it.

This repository's `just dev-bootstrap` uses the development registration workflow
to select its newly compiled `dotfiles` binary in the target dotfiles project.
