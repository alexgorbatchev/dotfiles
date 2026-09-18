# Create `.tool.ts` Configuration

## Mission

Create a complete, working `.tool.ts` configuration file for a CLI tool.

Your job is to analyze the tool and its distribution method, then generate a configuration that follows the repository's best practices and aligns with the current API.

This page is the procedure. It links to the reference page for every API it uses; follow
the link rather than guessing a parameter.

## Input

You will receive:

- **Tool Source**: a URL (GitHub repo, homepage) or a tool name.
- **Tool Name** (optional): if not provided, derive it from the source.

## Required Analysis Steps

> [!TIP]
> Always start with the smallest possible configuration. Provide only the minimum `install()` method and `.bin()` declaration necessary to get the tool working. **Do not overbuild**. Only add `assetPattern`, `assetSelector`, `version`, `dependsOn`, or hooks if the minimal configuration fails to install correctly or lacks necessary context. If GitHub release auto-selection downloads the wrong file, try the smallest `assetPattern` that fixes it before reaching for `assetSelector`.

### 1) Tool Investigation

Make best effort to find current README and installation instructions online for the tool to understand:

- **Tool purpose**: what it does.
- **Primary distribution method**: how the authors expect users to install it.
- **Package managers**: whether it’s available via Homebrew, Cargo, etc.
- **Release assets**: if it uses GitHub or Gitea/Forgejo releases, what assets exist.
- **Binary names**: which executables it provides.
- **Platform support**: macOS/Linux/Windows and supported CPU architectures.
- **Dependencies**: runtime requirements (shared libs, language runtimes, etc.).

### 2) Release Asset Analysis (if applicable)

If the tool uses GitHub or Gitea/Forgejo releases, examine the latest release to determine:

- **Asset naming patterns** (OS/arch/target naming).
- **Archive structure** (`.tar.gz`, `.zip`).
- **Binary locations** within the archive.
- **Platform variants** (different archives/assets per OS/arch).

For `github-release`, this investigation is meant to verify whether the built-in selector already handles the release naming. Do not turn a standard OS/arch matrix into a custom `assetSelector` unless the default selection or a simple `assetPattern` has already been proven insufficient.

### 3) Tool Behavior Analysis

Research the tool’s runtime behavior:

- **CLI surface**: common commands/options.
- **Configuration files**: expected locations and formats.
- **Shell integration**: completions, aliases, functions.
- **Environment variables**: supported env vars.

## Configuration Generation Process

### Step 1: Choose the Installation Method

Prefer the official, precompiled, well-supported distribution. The method table, with the
case each method is for, is in
[installation-methods/overview.md](installation-methods/overview.md); each method's own
page lists its parameters, and that page is the only place those parameters are
documented.

A rule of thumb: prebuilt binaries from a GitHub or Gitea release
(`github-release`, `gitea-release`) beat a package manager (`brew`, `apt`, `dnf`,
`pacman`, `cargo`, `npm`), which beats a download (`curl-tar`, `curl-binary`,
`curl-script`), which beats `manual`. Use `install()` with no method for a
configuration-only tool that contributes aliases, environment or symlinks.

### Step 2: Declare the Binaries

> **Every tool that provides a binary MUST have at least one `.bin()` declaration.** Without it, no shim is generated and the tool won't be accessible from the command line. This holds for every method, including the externally managed ones (`brew`, `apt`, `dnf`, `pacman`, `npm`, `dmg`, `pkg`): declare what the package provides so dotfiles manages it consistently.

```ts body
// Single binary, found at the archive root or one level down
install("github-release", { repo: "owner/tool" }).bin("tool");

// Multiple binaries - chain .bin() calls
install("github-release", { repo: "owner/tool" }).bin("tool").bin("tool-helper");

// Binary somewhere else in the archive
install("github-release", { repo: "owner/tool" }).bin("tool", "*/bin/tool");
```

What a shim does, the `{ pattern?, shim? }` options object and the pattern syntax are in
[core-api.md](api-reference/core-api.md#binname-runtime-behavior).

Paths come from `ctx`: `ctx.toolDir` for files next to the `.tool.ts`, `ctx.currentDir`
for files from the installed archive, and `~/` for the home directory. The full list is
in [context-api.md](api-reference/context-api.md).

### Step 3: Add Shell Integration

Use `.zsh()`, `.bash()` or `.powershell()`, each of which receives a shell configurator.

```ts body
install("github-release", { repo: "owner/tool" })
  .bin("tool")
  .zsh((shell) =>
    shell
      .env({ TOOL_HOME: ctx.currentDir })
      .aliases({ t: "tool" })
      .completions({ cmd: "tool completion zsh" })
      .sourceFile("init.zsh"),
  );
```

The configurator's methods are in
[shell-integration.md](api-reference/shell-integration.md), and completions have their
own page, [shell-completions.md](api-reference/shell-completions.md).

> **⚠️ CRITICAL: Shell Startup Performance**
>
> All tool configurations MUST be optimized for shell boot time. Every millisecond counts when the shell starts.
>
> **The golden rule**: Generate static files once, then source them at shell startup.
>
> - ❌ **BAD**: Running `eval "$(tool init)"` in `.always()` - executes on every shell start
> - ✅ **GOOD**: Using `.completions({ cmd: '...' })` - generates a static file once, sources it at startup
> - ✅ **GOOD**: Using an `after-install` hook to generate a static file, then `.sourceFile()` to load it
> - ✅ **GOOD**: Using `.functions()` with `.sourceFunction()` - defines the function once, sources its output at startup
>
> If a tool requires dynamic initialization (e.g. `eval "$(tool init)"`), write that output to a static file in the `after-install` hook and source that file instead.

### Step 4: Place Configuration Files

`.symlink(src, dest)` links a file or directory into place; `.copy(src, dest)` copies it
when the tool must own a real file. A relative source resolves against the directory
holding the `.tool.ts`, and `~/` in the target is expanded.

```ts body
install("github-release", { repo: "owner/tool" })
  .bin("tool")
  .symlink("config.toml", "~/.config/tool/config.toml")
  .symlink("./themes/", "~/.config/tool/themes");
```

Reference: [Symbolic Links](api-reference/shell-integration.md#symbolic-links) and
[`.copy()`](api-reference/core-api.md#copysrc-dest).

### Step 5: Add Platform Support (only when needed)

> **Important**: Only use `.platform()` when a single installer is unable to provide the necessary binaries. The `github-release` installer automatically selects the correct asset based on standard naming conventions. Only specify an `assetPattern` or `assetSelector` if the default logic fails or resolves the wrong asset.
>
> **Do not preemptively add `.platform()` overrides for missing architectures** (e.g. adding a `brew` fallback just because a macOS x64 build is missing from GitHub releases). The installer and OS (via Rosetta) may handle it gracefully. Assume the tool will work with a single method unless explicitly requested or verified to be broken.

```ts
import { defineTool, Platform } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .bin("tool")
    .platform(Platform.MacOS, (install) => install("brew", { formula: "tool" }))
    .platform(Platform.Linux, (install) => install("github-release", { repo: "owner/tool" })),
);
```

Reference: [platform-specific.md](configuration/platform-specific.md).

### Step 6: Add Installation Hooks (if needed)

Use hooks when the fluent configuration cannot express what the tool needs.

```ts body
install("github-release", { repo: "owner/tool" })
  .bin("tool")
  .hook("after-install", async ({ $, log }) => {
    // In after-install the tool's own binaries are on PATH, so no full path is needed
    await $`tool init`;
    log.info("Tool initialized");
  });
```

The four events, what each adds to the context, and the `$`, `fileSystem` and `log`
bindings are in [lifecycle-hooks.md](api-reference/lifecycle-hooks.md). The context
utilities a hook usually reaches for -- `ctx.replaceInFile()` for editing an installed
file, `ctx.resolve()` for a path whose name varies by version -- are in
[utilities.md](api-reference/utilities.md).

### Step 7: Restrict When the Tool Applies (if needed)

`.disable()` skips a tool without deleting its configuration, and `.hostname(pattern)`
limits it to machines whose hostname matches, for tools that belong to only one machine.
Both are in the [builder method table](api-reference/core-api.md#builder-methods).

## Output Requirements

### File Structure

Create a file named `{tool-name}.tool.ts`:

```ts no-typecheck
import { defineTool } from '@alexgorbatchev/dotfiles';

export default defineTool((install, ctx) =>
  // Your configuration here
);
```

### Required Elements

Your configuration MUST include:

1. An installation method via `install(...)`.
2. Binary declaration(s) via `.bin(...)` if the tool provides binaries.

### Documentation Comments

Include a brief JSDoc comment explaining:

- What the tool does.
- Platform notes (if applicable).
- The tool’s home URL as the very last line.

Do NOT include archive-structure narration in the comment (the code already shows the method).

## Example Output

### Example 1: Simple GitHub Release Tool

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * ripgrep - A line-oriented search tool that recursively searches your current
 * directory for a regex pattern.
 *
 * https://github.com/BurntSushi/ripgrep
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "BurntSushi/ripgrep",
  }).bin("rg"),
);
```

### Example 2: Tool with Shell Integration

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * fzf - Command-line fuzzy finder.
 *
 * https://github.com/junegunn/fzf
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "junegunn/fzf",
  })
    .bin("fzf")
    .zsh(
      (shell) =>
        shell
          .env({
            FZF_DEFAULT_OPTS: "--color=fg+:cyan,bg+:black,hl+:yellow",
          })
          .aliases({ f: "fzf" })
          .completions("completion.zsh") // Resolves to ctx.toolDir/completion.zsh
          .sourceFile("key-bindings.zsh"), // Resolves to ctx.toolDir/key-bindings.zsh
    ),
);
```

### Example 3: Manual Installation (Dotfiles Script)

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * deploy - Custom deployment script included with dotfiles.
 *
 * https://example.com/deploy
 */
export default defineTool((install) =>
  install("manual", {
    binaryPath: "./scripts/deploy.sh",
  })
    .bin("deploy")
    .symlink("./deploy.config.yaml", "~/.config/deploy/config.yaml"),
);
```

### Example 4: Manual Without Params

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * tokscale - Token scaling utility via bun.
 *
 * https://example.com/tokscale
 */
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
```

### Example 5: Configuration-Only Tool

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * git - Git configuration and aliases.
 *
 * https://git-scm.com
 */
export default defineTool((install) =>
  install() // Configuration-only: no install params, no .bin()
    .symlink("./gitconfig", "~/.gitconfig")
    .zsh((shell) =>
      shell.aliases({
        g: "git",
        gs: "git status",
        ga: "git add",
        gc: "git commit",
      }),
    ),
);
```

### Example 6: Rust Tool with Cargo

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * eza - A modern replacement for ls.
 *
 * https://github.com/eza-community/eza
 */
export default defineTool((install) =>
  install("cargo", {
    crateName: "eza",
    githubRepo: "eza-community/eza",
  })
    .bin("eza")
    .zsh(
      (shell) =>
        shell
          .aliases({
            ls: "eza",
            ll: "eza -l",
          })
          .completions("_eza"), // Resolves to ctx.toolDir/_eza
    ),
);
```

### Example 7: Tool with Shell Functions

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * kubectl - Kubernetes command-line tool with custom wrappers.
 *
 * https://kubernetes.io/docs/reference/kubectl/
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "kubernetes/kubectl",
  })
    .bin("kubectl")
    .zsh((shell) =>
      shell
        .env({
          KUBECONFIG: "~/.kube/config",
        })
        .aliases({
          k: "kubectl",
          kgp: "kubectl get pods",
        })
        .completions({ cmd: "kubectl completion zsh" })
        .functions({
          kns: /* zsh */ `
            kubectl config set-context --current --namespace="$1"
          `,
        }),
    ),
);
```

### Example 8: Tool with Dynamic Initialization

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * zoxide - A smarter cd command with frecency tracking.
 *
 * https://github.com/ajeetdsouza/zoxide
 */
export default defineTool((install) =>
  install("github-release", {
    repo: "ajeetdsouza/zoxide",
  })
    .bin("zoxide")
    .zsh((shell) =>
      shell
        .env({
          _ZO_DATA_DIR: "~/.local/share/zoxide",
        })
        .completions({ cmd: "zoxide completions zsh" })
        .functions({ initZoxide: "zoxide init zsh --cmd cd" })
        .sourceFunction("initZoxide"),
    ),
);
```

### Example 9: Zsh Plugin (Git Repository)

```ts
import { defineTool } from "@alexgorbatchev/dotfiles";

/**
 * zsh-vi-mode - A better and friendly vi(vim) mode plugin for ZSH.
 *
 * https://github.com/jeffreytse/zsh-vi-mode
 */
export default defineTool((install) =>
  install("zsh-plugin", {
    repo: "jeffreytse/zsh-vi-mode",
  }).zsh((shell) =>
    shell.env({
      ZVM_VI_INSERT_ESCAPE_BINDKEY: "jj",
    }),
  ),
);
```

## Syncing Changes

After any `.tool.ts` file change, you **must** run `dotfiles generate` to sync the generated artifacts (shims, shell scripts, completions). This applies whenever:

- A new `.tool.ts` file is created
- An existing `.tool.ts` file is deleted
- An existing `.tool.ts` file is modified

Without this step, the generated shims and shell configuration will be out of sync with the tool definitions.

## Quality Checklist

**Installation & binaries**

- ✅ Installation method matches the tool's official distribution
- ✅ Every tool that provides executables has at least one `.bin()` declaration
- ✅ `.bin(name, pattern?)` declarations match actual executables
- ✅ Binary patterns are correct for archive structures
- ✅ `.dependsOn()` uses binary names (not tool names) from other tools' `.bin()` declarations

**Paths**

- ✅ Use `ctx.toolDir` for files next to `.tool.ts` (tool configuration directory)
- ✅ Use `ctx.currentDir` for installed assets (stable symlink to versioned directory)
- ✅ For symlink targets and environment variables: use `~/` (tilde expansion is automatic)
- ✅ All relative paths (`.completions()`, `.sourceFile()`, `.symlink()`) resolve to `toolDir`
- ✅ Never use hardcoded absolute paths like `/home/user/...`

**Shell integration**

- ✅ Use `.completions({ cmd: '...' })` for dynamic completions (not `.once()`)
- ✅ Use `.once()` only for expensive one-time setup (cache building, initialization)
- ✅ Use `.always()` for fast runtime setup (environment, eval statements)
- ✅ Use `.functions()` for shell function wrappers
- ✅ Shell scripts are fast and use context variables
- ✅ Completions configured within shell blocks (`.zsh()`, `.bash()`, `.powershell()`)

**Function signature**

- ✅ Import `defineTool` from `'@alexgorbatchev/dotfiles'`
- ✅ Use `export default defineTool((install, ctx) => ...)` - omit `ctx` if not used
- ✅ Call `install(method, params)` first to specify installation
- ✅ Chain additional configuration methods

## References

- [Installation Methods](installation-methods/overview.md) - every method, its case, and its parameters
- [Core API](api-reference/core-api.md) - `defineTool`, builder methods, enums
- [Context API](api-reference/context-api.md) - `ctx` properties and path resolution
- [Shell Integration](api-reference/shell-integration.md) - shell configurator and symlinks
- [Shell Completions](api-reference/shell-completions.md) - completion setup
- [Lifecycle Hooks](api-reference/lifecycle-hooks.md) - installation hooks
- [Utilities](api-reference/utilities.md) - `replaceInFile`, `resolve`, `log`, `dedentString`
- [Getting Started](configuration/getting-started.md) - basic structure and anatomy
- [Common Patterns](configuration/common-patterns.md) - real-world examples
- [Platform Support](configuration/platform-specific.md) - platform-specific configurations
- [Troubleshooting](configuration/troubleshooting.md) - common issues and solutions
