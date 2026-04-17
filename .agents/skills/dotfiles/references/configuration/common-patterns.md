---
title: Common Patterns
sidebar:
  order: 3
---

# Common Patterns

Real-world examples for common tool configuration scenarios.

## GitHub Tool with Shell Integration

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "BurntSushi/ripgrep" })
    .bin("rg")
    .zsh((shell) => shell.completions("complete/_rg").aliases({ rg: "ripgrep" }))
    .bash((shell) => shell.completions("complete/rg.bash")),
);
```

## Tool Dependencies

Use `.dependsOn()` when a tool needs other binaries to exist first:

```typescript
// provider.tool.ts
export default defineTool((install) => install("manual", { binaryPath: "./bin/provider" }).bin("provider"));

// consumer.tool.ts
export default defineTool((install) =>
  install("github-release", { repo: "owner/consumer" }).bin("consumer").dependsOn("provider"),
);
```

## Complex Shell Integration

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "junegunn/fzf" })
    .bin("fzf")
    .zsh((shell) =>
      shell.env({ FZF_DEFAULT_OPTS: "--color=fg+:cyan" }).completions("shell/completion.zsh").always(/* zsh */ `
          if [[ -f "${ctx.currentDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.currentDir}/shell/key-bindings.zsh"
          fi
        `),
    ),
);
```

## Cross-Shell Configuration

```typescript
export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.completions("completions/_tool").env({ TOOL_CONFIG: "~/.config/tool" }).aliases({ t: "tool" }),
    )
    .bash((shell) =>
      shell.completions("completions/tool.bash").env({ TOOL_CONFIG: "~/.config/tool" }).aliases({ t: "tool" }),
    ),
);
```

## With Hooks

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .symlink("./config.yml", "~/.config/tool/config.yml")
    .hook("after-install", async ({ installedDir, fileSystem, $ }) => {
      await $`${installedDir}/tool init`;
    }),
);
```

## Platform-Specific Installation

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .platform(Platform.MacOS, (installMac) => installMac("brew", { formula: "tool" }))
    .platform(Platform.Linux, (installLinux) =>
      installLinux("github-release", {
        repo: "owner/tool",
        assetPattern: "*linux*.tar.gz",
      }),
    )
    .platform(Platform.Windows, Architecture.Arm64, (installWin) =>
      installWin("github-release", {
        repo: "owner/tool",
        assetPattern: "*windows-arm64.zip",
      }),
    ),
);
```

## Cargo (Rust) Tool

```typescript
export default defineTool((install) =>
  install("cargo", {
    crateName: "eza",
    githubRepo: "eza-community/eza",
  })
    .bin("eza")
    .zsh((shell) => shell.completions("completions/eza.zsh").aliases({ ls: "eza", ll: "eza -l", la: "eza -la" })),
);
```

## Manual Script

```typescript
export default defineTool((install) =>
  install("manual", { binaryPath: "./scripts/deploy.sh" })
    .bin("deploy")
    .symlink("./deploy.config.yaml", "~/.config/deploy/config.yaml")
    .zsh((shell) =>
      shell.aliases({
        dp: "deploy",
        "deploy-prod": "deploy --env production",
      }),
    ),
);
```

## Configuration-Only (No Binary)

```typescript
export default defineTool((install) =>
  install()
    .symlink("./gitconfig", "~/.gitconfig")
    .zsh((shell) => shell.aliases({ g: "git", gs: "git status", ga: "git add" }).env({ GIT_EDITOR: "nvim" })),
);
```

## Custom Asset Selection

Use `assetSelector` when the repository uses non-standard asset names or when you intentionally want something other than the default smart selector. Standard Linux `gnu` vs `musl` release names are handled automatically.

```typescript
export default defineTool((install) =>
  install("github-release", {
    repo: "owner/tool",
    assetSelector: ({ assets }) => {
      return assets.find((a) => a.name.endsWith("-portable.tar.gz"));
    },
  }).bin("tool"),
);
```

## Installation Method Quick Reference

| Use Case          | Method           | Example Tools      |
| ----------------- | ---------------- | ------------------ |
| GitHub releases   | `github-release` | fzf, ripgrep, bat  |
| Gitea/Forgejo     | `gitea-release`  | Codeberg tools     |
| Homebrew          | `brew`           | git, jq            |
| Rust crates       | `cargo`          | eza, fd, ripgrep   |
| npm packages      | `npm`            | prettier, eslint   |
| Custom scripts    | `manual`         | deployment scripts |
| Shell config only | `install()`      | aliases, env vars  |
| Installer scripts | `curl-script`    | rustup, nvm        |
| Direct binaries   | `curl-binary`    | single-file tools  |
| macOS installer   | `pkg`            | signed macOS tools |

## Further Reading

- For bootstrap, shell setup, file layout, and your first `.tool.ts`, see [Getting Started](./getting-started.md).
- For global paths, generated directories, and project-level settings, see [Project Configuration](./project-configuration.md).
- For installation-method selection and the full tool-authoring workflow, see [Make Tool](../make-tool.md).
