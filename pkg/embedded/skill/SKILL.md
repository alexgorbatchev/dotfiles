---
name: dotfiles
description: >-
  .tool.ts configuration files, defineTool, install(), dotfiles.config.ts, defineConfig,
  installation methods (github-release, gitea-release, brew, cargo, npm, uv, curl-script, curl-tar, curl-binary, dmg, pkg, manual, zsh-plugin, apt, dnf, pacman),
  declarative file management (blocks, templates, ensureDir, symlinks, copies), shell integration (aliases, functions, completions, env, sourceFile),
  hooks (before-install, after-download, after-extract, after-install),
  platform overrides, virtual environments, shim generation, dotfiles management.
author: alexgorbatchev
metadata:
  created_on: 2026-03-04 19:29
  last_modified: 2026-10-08 17:32
  status: current
---

## Creating Tool Files

1. Work in `$HOME/.dotfiles` when creating a tool for the user's dotfiles. Read its
   `AGENTS.md`, applicable nested instructions, `dotfiles.config.ts`, and package
   scripts. Inspect existing definitions and the working diff; preserve unrelated
   changes. Clarify an ambiguous tool name or source before editing.
2. Follow [make-tool.md](references/make-tool.md) and read the canonical reference
   for the selected installer before using its parameters. Verify the tool's official
   installation docs, release assets, executable names, archive layout, target
   platform support, and runtime requirements.
3. Prefer official GitHub release binaries using
   [github-release](references/installation-methods/github-release.md) when they
   support the target. Start with automatic asset selection; add a pattern, selector,
   platform override, or hook only when verified requirements justify it. Investigate
   release pages and download URLs; this preference does not enable `ghCli` or API access.
4. For npm packages, prefer Bun using the documented
   [npm installer](references/installation-methods/npm.md) with `packageManager: 'bun'`
   and `.dependsOn('bun')`. Verify that a managed tool declares the `bun` binary.
   Use npm only when official requirements or a reproduced failure show that Bun
   cannot install or run the package, and report that evidence. Do not invent a
   `bun` installation method or substitute a function that runs `bun x` on every invocation.
5. Create the definition inside a configured `paths.toolConfigsDir`, following the
   project's placement rules. Default-export a `defineTool` definition, declare each
   executable with `.bin()`, and use verified binary names for dependencies. Include
   the tool description and official URL required by the make-tool guide.
6. Add shell integration when requested or required. Generate static initialization
   and completion files rather than executing the tool on every shell startup.
7. Run generation after tool-file changes, then the formatting, lint, and typecheck
   commands verified against local instructions and package scripts. Inspect the
   resulting diff and generated artifacts; edit maintained sources rather than
   generated output or vendored documentation. Install the tool when installation
   was requested. Report the file path, installer, binaries, and actual validation
   results; distinguish generation from a verified installation.

Print this skill with `dotfiles skill`. To access the bundled reference files locally,
use [`dotfiles skill copy`](references/getting-started/cli-reference.md#dotfiles-skill-copy-path).

Manage downloaded archives with [`dotfiles cache clear`](references/getting-started/cli-reference.md#dotfiles-cache-clear).

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

`dotfiles install <tool-or-binary>` is also a repair command: it checks the recorded installation, reinstalls the tool when the payload is missing or broken, and reconciles the tool's generated artifacts either way. What a shim points at, including for externally managed tools, is described under [`.bin(name)` runtime behavior](references/api-reference/core-api.md#binname-runtime-behavior).

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
  - [overview.md](references/installation-methods/overview.md) — The method comparison table and how to choose between them
  - [apt.md](references/installation-methods/apt.md) — Debian-family Linux package installation
  - [dnf.md](references/installation-methods/dnf.md) — RPM-family Linux package installation
  - [pacman.md](references/installation-methods/pacman.md) — Arch-family Linux package installation
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
  - [uv.md](references/installation-methods/uv.md) — Python CLI tool installation via uv
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

## Choosing an Installation Method

The comparison table -- every method, the case it is for and example tools -- is in
[installation-methods/overview.md](references/installation-methods/overview.md).
