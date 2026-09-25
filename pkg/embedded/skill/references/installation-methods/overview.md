---
title: Overview
sidebar:
  order: 1
---

# Overview

The system supports multiple installation methods to accommodate different tool distribution patterns. Each method has its own page with its parameters and examples; this page compares them and links to those pages.

## Choosing the Right Method

Direct download methods like `github-release`, `curl-tar`, or `curl-binary` are strongly recommended when available. Because they fetch isolated binaries directly into the dotfiles data directory, the dotfiles manager maintains full control over the runtime environment, version tracking, and execution shims.

Using external package managers like `brew` or `npm` is fully supported and sometimes necessary, but introduces potential state drift. These package managers natively own their own placement, upgrades, and environment links. If you run `brew upgrade` externally, the binary may update out of sync with what the dotfiles manager recorded. While this won't break the system, it's best practice to drive all updates through the `dotfiles update` CLI directly to keep state consistent.

| Method                              | Best For                            | Pros                                   | Cons                                  |
| ----------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------------- |
| [apt](apt.md)                       | Debian-family Linux packages        | Uses distro packages                   | Linux distro-specific, external state |
| [brew](brew.md)                     | macOS/Linux tools                   | Simple, well-maintained                | Platform-specific, requires Homebrew  |
| [cargo](cargo.md)                   | Rust tools                          | Fast pre-compiled binaries             | Rust tools only                       |
| [curl-binary](curl-binary.md)       | Direct binary downloads             | Simplest, no extraction needed         | Manual URL management                 |
| [curl-script](curl-script.md)       | Custom installers                   | Flexible, handles complex setups       | Less predictable, security concerns   |
| [curl-tar](curl-tar.md)             | Archive downloads                   | Simple, no dependencies                | Manual URL management                 |
| [dmg](dmg.md)                       | macOS .app bundles                  | Handles mount/unmount, archive extract | macOS only                            |
| [dnf](dnf.md)                       | RPM-family Linux packages           | Uses distro packages                   | Linux distro-specific, external state |
| [gitea-release](gitea-release.md)   | Codeberg / self-hosted Gitea tools  | Supports any Gitea-compatible host     | Requires instance URL                 |
| [github-release](github-release.md) | Most open source tools              | Automatic updates, cross-platform      | Requires GitHub hosting               |
| [manual](manual.md)                 | Custom scripts, configuration tools | Include files with dotfiles, flexible  | Manual file management                |
| [npm](npm.md)                       | Node.js tools                       | Simple, version management             | Requires Node.js/npm                  |
| [pacman](pacman.md)                 | Arch-family Linux packages          | Uses distro packages                   | Linux distro-specific, external state |
| [pkg](pkg.md)                       | macOS installer packages            | Uses native installer flow             | macOS only                            |
| [uv](uv.md)                         | Python CLI tools                    | Isolated venvs, managed launcher shims | Requires uv                           |
| [zsh-plugin](zsh-plugin.md)         | Zsh plugins from Git repos          | Simple, automatic updates              | Zsh plugins only                      |

Parameters shared by every method (`auto`) are documented under [Base Install Parameters](../api-reference/core-api.md#base-install-parameters). The `env` install parameter is read only by [curl-script](curl-script.md#parameters).
