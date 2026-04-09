---
name: dotfiles
description: >-
  .tool.ts configuration files, defineTool, install(), dotfiles.config.ts, defineConfig,
  installation methods (github-release, gitea-release, brew, cargo, npm, curl-script, curl-tar, curl-binary, dmg, manual, zsh-plugin),
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

## Syncing Changes

After any `.tool.ts` file change (create, delete, or modify), run `dotfiles generate` to sync generated artifacts.

## Reference Files

Read these based on the task at hand:

- **[make-tool.md](references/make-tool.md)** — Complete guide for creating `.tool.ts` configurations. Read when creating a new tool config or modifying an existing one. Includes tool investigation steps, method selection, examples, and quality checklist.

- **[api-reference.md](references/api-reference.md)** — Public API reference: `defineTool`, `defineConfig`, builder methods, shell configurator methods, `Platform`/`Architecture` enums, utilities (`replaceInFile`, `resolve`, `log`).

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
  - [manual.md](references/installation-methods/manual.md) — Custom scripts, pre-built binaries, config-only tools
  - [zsh-plugin.md](references/installation-methods/zsh-plugin.md) — Zsh plugin Git repository cloning

- **[shell-and-hooks.md](references/shell-and-hooks.md)** — Shell integration (aliases, functions, env, path, completions, sourceFile, sourceFunction, source, symlinks), hook events and context, completions configuration.

- **[configuration.md](references/configuration.md)** — Project config (`defineConfig`), getting started, platform support, virtual environments, advanced topics, troubleshooting.

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
| Custom/scripts         | `manual`         | deployment scripts |
| Zsh plugins            | `zsh-plugin`     | zsh-vi-mode        |
| Config only            | `install()`      | aliases, env vars  |
