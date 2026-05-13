---
title: Overview
sidebar:
  order: 1
---

# Overview

The system supports multiple installation methods to accommodate different tool distribution patterns. Each method has its own parameters and use cases.

## Choosing the Right Method

Direct download methods like `github-release`, `curl-tar`, or `curl-binary` are strongly recommended when available. Because they fetch isolated binaries directly into the dotfiles data directory, the dotfiles manager maintains full control over the runtime environment, version tracking, and execution shims.

Using external package managers like `brew` or `npm` is fully supported and sometimes necessary, but introduces potential state drift. These package managers natively own their own placement, upgrades, and environment links. If you run `brew upgrade` externally, the binary may update out of sync with what the dotfiles manager recorded. While this won't break the system, it's best practice to drive all updates through the `dotfiles update` CLI directly to keep state consistent.

| Method             | Best For                            | Pros                                   | Cons                                  |
| ------------------ | ----------------------------------- | -------------------------------------- | ------------------------------------- |
| **apt**            | Debian-family Linux packages        | Uses distro packages                   | Linux distro-specific, external state |
| **brew**           | macOS/Linux tools                   | Simple, well-maintained                | Platform-specific, requires Homebrew  |
| **cargo**          | Rust tools                          | Fast pre-compiled binaries             | Rust tools only                       |
| **dnf**            | RPM-family Linux packages           | Uses distro packages                   | Linux distro-specific, external state |
| **curl-binary**    | Direct binary downloads             | Simplest, no extraction needed         | Manual URL management                 |
| **curl-script**    | Custom installers                   | Flexible, handles complex setups       | Less predictable, security concerns   |
| **curl-tar**       | Archive downloads                   | Simple, no dependencies                | Manual URL management                 |
| **dmg**            | macOS .app bundles                  | Handles mount/unmount, archive extract | macOS only                            |
| **pkg**            | macOS installer packages            | Uses native installer flow             | macOS only                            |
| **gitea-release**  | Codeberg / self-hosted Gitea tools  | Supports any Gitea-compatible host     | Requires instance URL                 |
| **github-release** | Most open source tools              | Automatic updates, cross-platform      | Requires GitHub hosting               |
| **manual**         | Custom scripts, configuration tools | Include files with dotfiles, flexible  | Manual file management                |
| **npm**            | Node.js tools                       | Simple, version management             | Requires Node.js/npm                  |
| **zsh-plugin**     | Zsh plugins from Git repos          | Simple, automatic updates              | Zsh plugins only                      |

## Available Methods

### apt

Install Debian-family Linux packages using APT.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("apt", {
    package: "ripgrep",
  })
    .bin("rg")
    .sudo(),
);
```

### brew

Install tools using Homebrew package manager (macOS and Linux).

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("brew", {
    formula: "ripgrep",
  }).bin("rg"),
);
```

### dnf

Install RPM-family Linux packages using DNF.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("dnf", {
    package: "ripgrep",
  })
    .bin("rg")
    .sudo(),
);
```

### cargo

Install Rust tools from crates.io with cargo-quickinstall for faster downloads.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("cargo", {
    crateName: "ripgrep",
  }).bin("rg"),
);
```

### curl-binary

Download standalone binary files directly from URLs (no archive extraction).

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("curl-binary", {
    url: "https://example.com/tool-v1.0.0-linux-amd64",
  }).bin("tool"),
);
```

### curl-script

Download and execute installation scripts.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("curl-script", {
    url: "https://bun.sh/install",
    shell: "bash",
  }).bin("bun"),
);
```

### curl-tar

Download and extract tarballs directly from URLs.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("curl-tar", {
    url: "https://releases.example.com/tool-v1.0.0.tar.gz",
  }).bin("tool"),
);
```

### dmg

Install macOS applications from DMG disk images into `/Applications` (silently skipped on other platforms).

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("dmg", {
    source: {
      type: "url",
      url: "https://example.com/MyApp-1.0.0.dmg",
    },
  }),
);
```

DMG also supports GitHub release sources:

```typescript
install("dmg", {
  source: {
    type: "github-release",
    repo: "manaflow-ai/cmux",
    assetPattern: "*macos*.dmg",
  },
});
```

### pkg

Install macOS `.pkg` packages with the native `installer` command (silently skipped on other platforms).

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("pkg", {
    source: {
      type: "url",
      url: "https://example.com/MyTool.pkg",
    },
    binaryPath: "/usr/local/bin/my-tool",
  }).bin("my-tool"),
);
```

### gitea-release

Install tools from Gitea, Forgejo, or Codeberg releases with automatic asset selection.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("gitea-release", {
    instanceUrl: "https://codeberg.org",
    repo: "owner/repository",
  }).bin("tool"),
);
```

### github-release

Install tools from GitHub releases with automatic asset selection and extraction.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", {
    repo: "owner/repository",
  }).bin("tool"),
);
```

### manual

Install files from your dotfiles directory (custom scripts, pre-built binaries) or configuration-only tools. Can be called without params: `install('manual')`.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

// With binary installation
export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./bin/my-script.sh",
  }).bin("my-script"),
);

// Without params (shell-only or dependency wrapper)
export default defineTool((install) =>
  install("manual")
    .bin("tokscale")
    .dependsOn("bun")
    .zsh((shell) =>
      shell.functions({
        tokscale: `bun x tokscale@latest`,
      }),
    ),
);

// Configuration-only
export default defineTool((install, ctx) => install().zsh((shell) => shell.aliases({ ll: "ls -la" })));
```

### npm

Install tools published as npm packages.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("npm", {
    package: "prettier",
  }).bin("prettier"),
);
```

### zsh-plugin

Clone Git repositories for zsh plugins.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("zsh-plugin", {
    repo: "jeffreytse/zsh-vi-mode",
  }).zsh((shell) => shell.always(`source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"`)),
);
```

## Manual Installation Guide

The `manual` method is the unified approach for binary installation from your dotfiles directory.

### Use **Manual** for Binary Installation:

- You have custom scripts or binaries to include with your dotfiles
- You want the system to manage and version your tool files
- You need shims generated for your custom tools
- You want to distribute pre-built binaries with your dotfiles

**Example:** Including a custom deployment script with your dotfiles.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("manual", {
    binaryPath: "./scripts/deploy.sh",
  }).bin("deploy"),
);
```

### Use `install()` for Configuration Only:

- You only need shell configuration (aliases, environment, symlinks)
- Tools are managed entirely outside the dotfiles system
- You don't want any binary installation or management
- Creating configuration-only "tools"

**Example:** Setting up shell aliases and environment variables.

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install().zsh((shell) =>
    shell
      .aliases({
        ll: "ls -la",
      })
      .env({
        EDITOR: "vim",
      }),
  ),
);
```

## Common Parameters

Most installation methods support these common concepts:

- **Version Selection**: Specify exact versions or use constraints
- **Platform Detection**: Automatic selection of appropriate binaries
- **Binary Path**: Specify which file is the main executable
- **Asset Selection**: Choose the right download for your platform
- **Environment Variables**: Set `env` for installation (static or dynamic)

### Environment Variables (`env`)

All installation methods support an `env` parameter for setting environment variables during installation:

```typescript
// Static environment variables
install("github-release", {
  repo: "owner/tool",
  env: { CUSTOM_FLAG: "true" },
}).bin("tool");

// Dynamic environment variables
install("curl-script", {
  url: "https://example.com/install.sh",
  shell: "bash",
  env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
}).bin("tool");
```

Dynamic `env` functions receive a context with:

- `projectConfig` - Full project configuration
- `stagingDir` - Temporary installation directory

For `curl-script`, the context also includes `scriptPath`.
