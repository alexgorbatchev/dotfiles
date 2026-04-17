---
title: Getting Started
sidebar:
  order: 2
---

# Getting Started

This guide covers how to create `.tool.ts` configuration files for your CLI tools.

## Prerequisites

Set up your project configuration first. See Project Configuration for instructions.

## Bootstrap Install

To bootstrap a dotfiles project in the current directory, run:

```bash
curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash
```

The hosted installer uses Bun from `PATH` when available. Otherwise it checks for `curl` and `unzip` before prompting, bootstraps a temporary Bun, adds `@alexgorbatchev/dotfiles` to the local `package.json` without running your project's lifecycle scripts, creates a minimal `dotfiles.config.ts` when needed, installs managed Bun, and runs `dotfiles generate` for you. Generated `dotfiles` shell output resolves Bun at runtime instead of pinning the temporary bootstrap Bun path, and the temporary bootstrap directory is cleaned up before exit even if a later step fails.

## Load Generated Config

With the default project layout, the generated zsh config lives at `.generated/shell-scripts/main.zsh` inside your dotfiles directory.

Add it to `~/.zshrc`:

```bash
source "$HOME/.dotfiles/.generated/shell-scripts/main.zsh"
```

> [!IMPORTANT]
> Configure bash even if your interactive shell is zsh. AI harnesses and other automation often start bash and rely on `~/.bashrc` or `~/.profile` to load the same environment.

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

Then reload zsh:

```bash
source ~/.zshrc
```

## File Structure

Tool configurations are placed in your `toolConfigsDir` (default: `~/.dotfiles/tools`):

```
tools/
├── fzf.tool.ts
├── ripgrep.tool.ts
└── dev/
    ├── node.tool.ts
    └── rust.tool.ts
```

Files must be named `{tool-name}.tool.ts` and export a default using `defineTool`.

## Minimal Configuration

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", {
    repo: "junegunn/fzf",
  }).bin("fzf"),
);
```

## Complete Example

```typescript
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("github-release", {
    repo: "BurntSushi/ripgrep",
  })
    .bin("rg")
    .dependsOn("pcre2")
    .symlink("./ripgreprc", "~/.ripgreprc")
    .zsh((shell) => shell.env({ RIPGREP_CONFIG_PATH: "~/.ripgreprc" }).aliases({ rgi: "rg -i" })),
);
```

## Available Methods

After calling `install()`, these methods are available:

| Method                   | Purpose                               |
| ------------------------ | ------------------------------------- |
| `.bin(name)`             | Define binary name(s) to expose       |
| `.version(v)`            | Set version (`'latest'` or specific)  |
| `.dependsOn(bin)`        | Declare binary dependencies           |
| `.symlink(src, dest)`    | Create config file symlinks           |
| `.hook(event, fn)`       | Lifecycle hooks                       |
| `.zsh(fn)` / `.bash(fn)` | Shell-specific configuration          |
| `.platform(p, fn)`       | Platform-specific overrides           |
| `.disable()`             | Skip tool during generation           |
| `.hostname(pattern)`     | Restrict tool to specific hostname(s) |

## TypeScript Setup

### Imports

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";
```

| Export         | Description                                    |
| -------------- | ---------------------------------------------- |
| `defineTool`   | Factory function to create tool configurations |
| `Platform`     | Enum: `Darwin`, `Linux`, `Windows`, `MacOS`    |
| `Architecture` | Enum: `X86_64`, `Arm64`                        |

### Configuration-Only Tools

Tools that only contribute shell configuration (no binary installation):

```typescript
export default defineTool((install) => install().zsh((shell) => shell.env({ FOO: "bar" })));
```

### Orphaned Artifact Cleanup

When a `.tool.ts` configuration file is removed, `dotfiles generate` automatically cleans up the corresponding generated shims and completions on the next run. No manual cleanup is needed.

### Auto-Generated Types

Running `dotfiles generate` creates `.generated/tool-types.d.ts` with type-safe `dependsOn()` autocomplete for all your tool binaries.

Add to your `tsconfig.json`:

```json
{
  "include": ["tools/**/*.tool.ts", ".generated/tool-types.d.ts"]
}
```

### Common Type Errors

```typescript
// ❌ Missing required parameter
install('github-release', {})  // Error: 'repo' is required

// ❌ Invalid parameter for method
install('brew', { repo: 'owner/tool' })  // Error: 'repo' not valid for brew

// ❌ String instead of enum
.platform('macos', ...)  // Error: use Platform.MacOS
```
