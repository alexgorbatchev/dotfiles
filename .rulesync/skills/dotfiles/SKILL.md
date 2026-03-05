---
name: dotfiles
description: >-
  Dotfiles tool installer system — creating, modifying, and managing .tool.ts configuration files
  for CLI tool installations, shell integration, and cross-platform dotfiles management.
  Use when working with: (1) .tool.ts configuration files, (2) installation methods (github-release,
  brew, cargo, npm, curl-script, curl-tar, curl-binary, manual, dmg, zsh-plugin, gitea-release),
  (3) shell integration (aliases, functions, completions, environment variables, symlinks),
  (4) installation hooks (before-install, after-download, after-extract, after-install),
  (5) platform-specific configuration, (6) dotfiles project configuration (config.ts),
  (7) virtual environments for project-specific tool isolation.
---

# Dotfiles Tool Installer

Declarative, versioned dotfiles management. Define CLI tools in TypeScript `.tool.ts` files — the system handles installation, shim generation, shell integration, and cross-platform support.

## Quick Reference

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
    .zsh((shell) => shell.aliases({ rgi: 'rg -i' }).completions('complete/_rg'))
);
```

Every tool that provides executables **must** have `.bin()` — it generates a shim that makes the tool available system-wide and triggers installation on first use.

## Syncing Changes

After any `.tool.ts` file change (create, delete, or modify), run `dotfiles generate` to sync generated artifacts.

## Reference Files

Read these based on the task at hand:

- **[make-tool.md](references/make-tool.md)** — Complete guide for creating `.tool.ts` configurations. Read when creating a new tool config or modifying an existing one. Includes tool investigation steps, method selection, examples, and quality checklist.

- **[api-reference.md](references/api-reference.md)** — Public API reference: `defineTool`, `defineConfig`, builder methods, shell configurator methods, `Platform`/`Architecture` enums, utilities (`replaceInFile`, `resolve`, `log`).

- **[installation-methods.md](references/installation-methods.md)** — Parameters and examples for all 11 installation methods: github-release, gitea-release, brew, cargo, npm, curl-script, curl-tar, curl-binary, manual, dmg, zsh-plugin.

- **[shell-and-hooks.md](references/shell-and-hooks.md)** — Shell integration (aliases, functions, env, path, completions, sourceFile, sourceFunction, source, symlinks), hook events and context, completions configuration.

- **[configuration.md](references/configuration.md)** — Project config (`defineConfig`), getting started, platform support, virtual environments, advanced topics, troubleshooting.

## Method Selection Quick Reference

| Use Case | Method | Example Tools |
|---|---|---|
| GitHub releases | `github-release` | fzf, ripgrep, bat |
| Gitea/Forgejo/Codeberg | `gitea-release` | Codeberg tools |
| Homebrew | `brew` | git, jq |
| Rust crates | `cargo` | eza, fd |
| npm packages | `npm` | prettier, eslint |
| Install scripts | `curl-script` | rustup, nvm |
| Tarball URLs | `curl-tar` | direct archives |
| Direct binaries | `curl-binary` | single-file tools |
| macOS DMG | `dmg` | GUI apps |
| Custom/scripts | `manual` | deployment scripts |
| Zsh plugins | `zsh-plugin` | zsh-vi-mode |
| Config only | `install()` | aliases, env vars |
