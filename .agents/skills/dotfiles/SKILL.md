---
name: dotfiles
description: >-
  .tool.ts configuration files, defineTool, install(), dotfiles.config.ts, defineConfig,
  installation methods (github-release, gitea-release, brew, cargo, npm, curl-script, curl-tar, curl-binary, dmg, pkg, manual, zsh-plugin),
  shell integration (aliases, functions, completions, env, symlinks, sourceFile),
  hooks (before-install, after-download, after-extract, after-install),
  platform overrides, virtual environments, shim generation, dotfiles management.
---

# Dotfiles Tool Installer

Declarative, versioned dotfiles management. Define CLI tools in TypeScript `.tool.ts` files — the system handles installation, shim generation, shell integration, and cross-platform support.

## Quick Reference

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "BurntSushi/ripgrep" })
    .bin("rg")
    .zsh((shell) => shell.aliases({ rgi: "rg -i" }).completions("complete/_rg")),
);
```

Every tool that provides executables **must** have `.bin()` — it generates a shim that makes the tool available system-wide and triggers installation on first use.

## First Setup

After the first `dotfiles generate`, source the generated zsh config from your dotfiles directory:

```bash
source "$HOME/.dotfiles/.generated/shell-scripts/main.zsh"
```

**Configure bash even if your interactive shell is zsh. AI harnesses and other automation often start bash and rely on `~/.bashrc` or `~/.profile` to load the same environment.**

```bash
# ~/.bashrc

if [ -f "$HOME/.dotfiles/.generated/shell-scripts/main.bash" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.dotfiles/.generated/shell-scripts/main.bash"
fi

# ~/.profile
if [ -n "${BASH_VERSION:-}" ] && [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
```

## Syncing Changes

After any `.tool.ts` file change (create, delete, or modify), run `dotfiles generate` to sync generated artifacts.

`dotfiles install <tool-or-binary>` is also a repair command: it verifies the on-disk install payload, reinstalls broken tools, regenerates missing shims for non-externally-managed tools, removes stale temporary shims for externally managed tools, and reconciles the tool's generated artifacts.

## Reference Files

Read these based on the task at hand:

- **[make-tool.md](references/make-tool.md)** — Complete guide for creating `.tool.ts` configurations. Read when creating a new tool config or modifying an existing one. Includes tool investigation steps, method selection, examples, and quality checklist.

- **API Reference** — Public API reference: `defineTool`, `defineConfig`, builder methods, shell configurator methods, `Platform`/`Architecture` enums, utilities (`replaceInFile`, `resolve`, `log`).
  - [core-api.md](references/api-reference/core-api.md)
  - [utilities.md](references/api-reference/utilities.md)
  - [context-api.md](references/api-reference/context-api.md)
  - [shell-integration.md](references/api-reference/shell-integration.md)
  - [shell-completions.md](references/api-reference/shell-completions.md)
  - [lifecycle-hooks.md](references/api-reference/lifecycle-hooks.md)

- **Installation Methods** — Parameters and examples for each installation method:
  - [overview.md](references/installation-methods/overview.md) — Available methods, choosing the right method, manual installation guide, common parameters
  - [github-release.md](references/installation-methods/github-release.md) — GitHub release asset selection and platform detection
  - [gitea-release.md](references/installation-methods/gitea-release.md) — Gitea/Forgejo/Codeberg release installation
  - [brew.md](references/installation-methods/brew.md) — Homebrew formula and cask installation
  - [cargo.md](references/installation-methods/cargo.md) — Rust crate installation via cargo-quickinstall or GitHub releases
  - [npm.md](references/installation-methods/npm.md) — npm/bun package installation
  - [curl-script.md](references/installation-methods/curl-script.md) — Shell script installation with stagingDir
  - [curl-tar.md](references/installation-methods/curl-tar.md) — Tarball download and extraction
  - [curl-binary.md](references/installation-methods/curl-binary.md) — Direct binary file download
  - [dmg.md](references/installation-methods/dmg.md) — macOS DMG disk image installation
  - [pkg.md](references/installation-methods/pkg.md) — macOS PKG installer package installation
  - [manual.md](references/installation-methods/manual.md) — Custom scripts, pre-built binaries, config-only tools
  - [zsh-plugin.md](references/installation-methods/zsh-plugin.md) — Zsh plugin Git repository cloning

- **Configuration Guide** — Project configuration (`defineConfig`), getting started, platform support, virtual environments, advanced topics, troubleshooting.
  - [getting-started.md](references/configuration/getting-started.md)
  - [project-configuration.md](references/configuration/project-configuration.md)
  - [platform-specific.md](references/configuration/platform-specific.md)
  - [virtual-environments.md](references/configuration/virtual-environments.md)
  - [common-patterns.md](references/configuration/common-patterns.md)
  - [advanced-topics.md](references/configuration/advanced-topics.md)
  - [troubleshooting.md](references/configuration/troubleshooting.md)

## Method Selection Quick Reference

| Use Case               | Method           | Example Tools      |
| ---------------------- | ---------------- | ------------------ |
| GitHub releases        | `github-release` | fzf, ripgrep, bat  |
| Gitea/Forgejo/Codeberg | `gitea-release`  | Codeberg tools     |
| Homebrew               | `brew`           | git, jq            |
| Rust crates            | `cargo`          | eza, fd            |
| npm packages           | `npm`            | prettier, eslint   |
| Install scripts        | `curl-script`    | rustup, nvm        |
| Tarball URLs           | `curl-tar`       | direct archives    |
| Direct binaries        | `curl-binary`    | single-file tools  |
| macOS DMG              | `dmg`            | GUI apps           |
| macOS PKG              | `pkg`            | installer packages |
| Custom/scripts         | `manual`         | deployment scripts |
| Zsh plugins            | `zsh-plugin`     | zsh-vi-mode        |
| Config only            | `install()`      | aliases, env vars  |
