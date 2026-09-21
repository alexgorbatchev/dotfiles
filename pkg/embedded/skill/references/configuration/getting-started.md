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

The hosted installer provisions a dotfiles project in the current directory, creates a minimal `dotfiles.config.ts` when needed, and runs `dotfiles generate` for you.

Generated shell output includes `# /path/to/tool.tool.ts` attribution comments before emitted blocks, including generated `.once/*` helper scripts created from `.once(...)` shell configuration.

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

`install()` returns a builder whose methods declare binaries, shell configuration,
symlinks, copies, hooks and platform overrides. They are listed in the
[builder method table](../api-reference/core-api.md#builder-methods).

## TypeScript Setup

### Imports

```typescript
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";
```

| Export         | Description                                    |
| -------------- | ---------------------------------------------- |
| `defineTool`   | Factory function to create tool configurations |
| `Platform`     | Enum: `Linux`, `MacOS`, `Windows`, `All`       |
| `Architecture` | Enum: `X86_64`, `Arm64`                        |

### Configuration-Only Tools

Tools that only contribute shell configuration (no binary installation):

```typescript
export default defineTool((install) => install().zsh((shell) => shell.env({ FOO: "bar" })));
```

### Orphaned Artifact Cleanup

When a `.tool.ts` configuration file is removed, `dotfiles generate` automatically cleans up the corresponding generated shims and completions on the next run. Removing a `.bin()` declaration from an existing tool also removes that tool's stale shim on the next `dotfiles generate`. No manual cleanup is needed.

### Auto-Generated Types

Running `dotfiles generate` writes everything type-checking needs under `.generated/`:

- `node_modules/@alexgorbatchev/dotfiles/` -- the authoring package's declarations, also reachable from the project root through a `node_modules` symlink the CLI creates
- `tool-types.d.ts` -- the registry of every configured binary name, including those of disabled tools, which gives `dependsOn()` its autocomplete and rejects a name no tool declares
- `tsconfig.json` -- the program the CLI type-checks with: `dotfiles.config.ts`, every tool configs directory, the registry and the runtime globals, with the compiler options the declarations are written for and no Node or Bun types

If the project has no `tsconfig.json`, `dotfiles generate` writes one that only extends the CLI's:

```json
{
  "extends": "./.generated/tsconfig.json"
}
```

Nothing has to be added by hand: the include list lives in the CLI-owned file and follows the configured tool directories. A `tsconfig.json` the CLI wrote before it owned one is updated to this form; a file you edited is left alone.

### Type-Checking

`dotfiles tool validate` type-checks the configuration with that program, using the TypeScript 7 compiler provisioned like any other tool: `dotfiles tool scaffold` writes `tools/typescript.tool.ts`, which installs `microsoft/typescript-go` from its GitHub release, and `dotfiles tool install typescript` installs it. The compiler is declared with `.bin("tsc", { shim: false })`, so it is not put on PATH and cannot shadow the TypeScript your other projects use; `tool validate` runs it from the tool's `current` directory. Until it is installed, `tool validate` reports that as an error rather than skipping the type-check. Your editor uses the same program through the extending `tsconfig.json`.

### Common Type Errors

```typescript no-typecheck
// ❌ Missing required parameter
install('github-release', {})  // Error: 'repo' is required

// ❌ Invalid parameter for method
install('brew', { repo: 'owner/tool' })  // Error: 'repo' not valid for brew

// ❌ String instead of enum
.platform('macos', ...)  // Error: use Platform.MacOS
```
