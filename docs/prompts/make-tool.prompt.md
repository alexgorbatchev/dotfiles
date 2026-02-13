---
agent: agent
---

# LLM Agent Instructions: Create `.tool.ts` Configuration

## Mission

Create a complete, working `.tool.ts` configuration file for a CLI tool.

Your job is to analyze the tool and its distribution method, then generate a configuration that follows the repository's best practices and aligns with the current API.

## Input

You will receive:

- **Tool Source**: a URL (GitHub repo, homepage) or a tool name.
- **Tool Name** (optional): if not provided, derive it from the source.

## Required Analysis Steps

### 1) Tool Investigation

Make best effort to find current README and installation instructions online for the tool to understand:

- **Tool purpose**: what it does.
- **Primary distribution method**: how the authors expect users to install it.
- **Package managers**: whether it’s available via Homebrew, Cargo, etc.
- **Release assets**: if it uses GitHub releases, what assets exist.
- **Binary names**: which executables it provides.
- **Platform support**: macOS/Linux/Windows and supported CPU architectures.
- **Dependencies**: runtime requirements (shared libs, language runtimes, etc.).

### 2) Release Asset Analysis (if applicable)

If the tool uses GitHub releases, examine the latest release to determine:

- **Asset naming patterns** (OS/arch/target naming).
- **Archive structure** (`.tar.gz`, `.zip`).
- **Binary locations** within the archive.
- **Platform variants** (different archives/assets per OS/arch).

### 3) Tool Behavior Analysis

Research the tool’s runtime behavior:

- **CLI surface**: common commands/options.
- **Configuration files**: expected locations and formats.
- **Shell integration**: completions, aliases, functions.
- **Environment variables**: supported env vars.

## Configuration Generation Process

### Step 1: Choose the Best Installation Method

Select the most appropriate method based on your investigation. Prefer official, precompiled, and well-supported methods.

- **`github-release`**: best for tools with prebuilt binaries on GitHub.
  - Guide: [GitHub Release Installation Guide](<root>/docs/installation/github-release.md)
  - Use `ghCli: true` to fetch releases via `gh` CLI instead of direct API access (useful for GitHub Enterprise or when `GITHUB_TOKEN` isn't configured)
  - Use `prerelease: true` to include prereleases when fetching latest (needed for repos that only publish prerelease versions)

- **`brew`**: use if the tool is officially available on Homebrew.
  - Guide: [Homebrew Installation Guide](<root>/docs/installation/homebrew.md)

- **`cargo`**: prefer for Rust tools available on crates.io.
  - Guide: [Cargo Installation Guide](<root>/docs/installation/cargo.md)

- **`curl-script`**: for tools with an official install script.
  - Guide: [Curl Script Installation Guide](<root>/docs/installation/curl-script.md)

- **`curl-tar`**: for direct archive downloads from a stable URL.
  - Guide: [Curl Tar Installation Guide](<root>/docs/installation/curl-tar.md)

- **`manual`**: for custom install logic or dotfiles-provided binaries/scripts.
  - Guide: [Manual Installation Guide](<root>/docs/installation/manual.md)

- **`zsh-plugin`**: for zsh plugins that are cloned from Git repositories.
  - Guide: [Zsh Plugin Installation Guide](<root>/docs/installation/zsh-plugin.md)

### Step 2: Configure Binary Specification

**Important**: `.bin(name, pattern?)` declares which executables the tool provides. It generates a shim for each binary name. Users can resolve the real path to a binary (bypassing shims) with `dotfiles bin <name>`.

```ts
// Single binary with default pattern
install('github-release', { repo: 'owner/tool' }).bin('tool');

// Multiple binaries - chain .bin() calls
install('github-release', { repo: 'owner/tool' }).bin('tool').bin('tool-helper');

// Custom pattern for binary location in archive
install('github-release', { repo: 'owner/tool' }).bin('tool', '*/bin/tool'); // Pattern: {,*/}tool by default
```

**Binary Pattern Matching (for archive-based installation methods only)**:

- **Default Pattern**: `{,*/}name` - matches binary at root or one level deep
- **Custom Patterns**: Use [minimatch](https://github.com/isaacs/minimatch) glob patterns with brace expansion
  - `'*/bin/tool'` - Binary in bin subdirectory
  - `'tool-*/bin/tool'` - Versioned directory structure
  - `'tool'` - Exact binary at archive root

**Key Context Variables** (used throughout configuration):

- `ctx.toolDir` → Directory containing the `.tool.ts` file (for files next to tool config)
- `ctx.currentDir` → Tool's stable `current` symlink directory (for installed assets after install)
- `ctx.toolName` → Name of the tool being configured
- `ctx.projectConfig.paths.binariesDir` → Tool binaries directory
- `ctx.projectConfig.paths.generatedDir` → Generated files directory
- `ctx.replaceInFile()` → Perform regex-based file modifications (see Step 6)
- `ctx.resolve()` → Resolve a glob pattern to a single path (throws if 0 or multiple matches)
- `ctx.log` → Logger for user-facing messages (trace/debug/info/warn/error)
- Use `~/` for paths relative to user's home directory (tilde expansion is automatic)

Reference: [API Reference](<root>/docs/api-reference.md) and [Context API](<root>/docs/context-api.md)

### Step 2.5: Configure Installation Environment (if needed)

All installation methods support an `env` parameter for setting environment variables during installation. This can be static or dynamic:

```ts
// Static environment variables
install('github-release', {
  repo: 'owner/tool',
  env: { CUSTOM_FLAG: 'true' },
}).bin('tool');

// Dynamic environment variables (receives context with projectConfig, stagingDir)
install('curl-script', {
  url: 'https://example.com/install.sh',
  shell: 'bash',
  env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
}).bin('tool');
```

**Environment Context** (available in dynamic `env` functions):

- `ctx.projectConfig` → Full project configuration
- `ctx.stagingDir` → Temporary installation directory (becomes versioned path after success)

> **Note:** For `curl-script`, the env context also includes `scriptPath` (path to downloaded script).

### Step 3: Add Shell Integration

Use the fluent shell configurator with `.zsh()`, `.bash()`, or `.powershell()` methods.

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh((shell) =>
    shell
      .env({
        TOOL_HOME: ctx.currentDir,
        TOOL_CONFIG_DIR: ctx.toolDir,
      })
      .aliases({
        t: 'tool',
        ts: 'tool status',
      })
      .completions('_tool') // Relative path resolves to toolDir/_tool
      .sourceFile('init.zsh') // Relative path resolves to toolDir/init.zsh (skips if missing)
      .always(/* zsh */ `
        # Fast runtime setup (runs every shell startup)
        ...
      `)
  );
```

> **⚠️ CRITICAL: Shell Startup Performance**
>
> All tool configurations MUST be optimized for shell boot time. Every millisecond counts when the shell starts.
>
> **The golden rule**: Generate static files once (in `after-install` hook), then source them at shell startup.
>
> - ❌ **BAD**: Running `eval "$(tool init)"` in `.always()` - executes on every shell start
> - ✅ **GOOD**: Using `.completions({ cmd: '...' })` - generates static file once, sources it at startup
> - ✅ **GOOD**: Using `after-install` hook to generate static files, then `.sourceFile()` to load them
> - ✅ **GOOD**: Using `.functions()` with `.sourceFunction()` - defines function once, sources its output at startup
>
> If a tool requires dynamic initialization (e.g., `eval "$(tool init)"`), generate the output to a static file in the `after-install` hook and source that file instead.

**Script Timing**:

- `.always(script)` - Runs every time shell starts (fast operations only)
- `.once(script)` - Runs only once after install/update (expensive operations)
- `.functions(record)` - Define shell functions

**Shell Configurator Methods**:

- `.env(record)` - Set environment variables (PATH prohibited - use `.path()`)
- `.path(dir)` - Add directory to PATH (deduplicated)
- `.aliases(record)` - Set command aliases
- `.completions(path | config)` - Set command completions
- `.sourceFile(path)` - Source a file (skips if missing)
- `.sourceFunction(fnName)` - Source output of a function defined via `.functions()`
- `.source(content)` - Source output of inline shell code (see below)
- `.always(script)` - Fast runtime setup scripts
- `.once(script)` - Expensive one-time setup scripts
- `.functions(record)` - Define shell functions

**Completions Syntax**:

> **Lifecycle**: All completions are generated only after `dotfiles install` succeeds,
> not during `dotfiles generate`. This ensures cmd-based completions can execute the installed
> binary and callbacks receive the actual installed version in `ctx.version`.

```ts
// From static file next to .tool.ts
.completions('_tool')

// From installed archive (use ctx.currentDir for absolute path)
.completions(`${ctx.currentDir}/completions/zsh/_tool`)

// From command output
.completions({ cmd: 'tool completion zsh' })

// From direct URL (filename derived from URL)
.completions({
  url: 'https://raw.githubusercontent.com/owner/repo/main/completions/_tool'
})

// From archive URL (requires source path within extracted archive)
.completions({
  url: 'https://github.com/owner/repo/releases/download/v1.0/completions.tar.gz',
  source: `${ctx.currentDir}/completions/_tool`
})

// With version in URL (callback receives ctx.version after install)
.completions((ctx) => ({
  url: `https://github.com/owner/repo/releases/download/${ctx.version}/completions.tar.gz`,
  source: `${ctx.currentDir}/completions/_tool`,
}))

// With bin override (when binary name differs from tool name)
.completions({
  cmd: 'fnm completions --shell zsh',
  bin: 'fnm',  // Results in '_fnm' instead of default
})
```

**Completion Path Resolution**:

- **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
- **Absolute paths** → used as-is
- **For archive files** → use `ctx.currentDir` to build absolute paths

**Functions and sourceFunction Syntax**:

```ts
// Define shell functions
.functions({
  'my-wrapper': /* zsh */`
    original-command --my-defaults "$@"
  `,
  'tool-safe': /* zsh */`
    TOOL_CONFIG="${ctx.toolDir}/config.yaml" tool "$@"
  `,
})

// Source output of a function defined via .functions()
// Useful for tools that require `eval "$(tool init)"` style initialization
.functions({
  initTool: 'tool env --use-on-cd',
})
.sourceFunction('initTool')
// Generates: source <(initTool) in bash/zsh, . (initTool) in PowerShell
```

**sourceFunction** is type-safe: you can only pass function names that were defined via `.functions()` earlier in the chain. This pattern is ideal for tools requiring dynamic initialization like `fnm`, `zoxide`, or `pyenv`.

**source Syntax** (inline sourcing):

```ts
// Source the output of inline shell code
// Content must PRINT shell code to stdout - that output gets sourced
.source('fnm env --use-on-cd')
// Generates:
// __dotfiles_source_toolname_0() {
//   fnm env --use-on-cd
// }
// source <(__dotfiles_source_toolname_0)
// unset -f __dotfiles_source_toolname_0

// Useful when you don't need a named function
.source('echo "export MY_VAR=value"')
```

Use `.source()` when you need to source command output inline without defining a named function via `.functions()`. The content must **print shell code to stdout** - this output is then sourced (executed) in the current shell.

Reference: [Shell Integration Guide](<root>/docs/shell-integration.md) and [Completions Guide](<root>/docs/completions.md)

### Step 4: Configure File Management (Symlinks)

Relative symlink source paths resolve to `ctx.toolDir` (the directory containing the `.tool.ts` file). Leading `./` is optional.

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .symlink('config.toml', '~/.config/tool/config.toml') // Resolves to ctx.toolDir/config.toml
  .symlink('./themes/', '~/.config/tool/themes'); // Leading ./ is optional
```

Reference: [Shell Integration Guide](<root>/docs/shell-integration.md#symbolic-links)

### Step 5: Add Platform Support (only when needed)

> **Important**: Only use `.platform()` when a single installer unable to provide necessary binaries. The `github-release` installer automatically selects the correct asset based on standard naming conventions (`darwin`/`linux`, `amd64`/`arm64`/`x86_64`). Do not use `.platform()` just to specify different asset patterns for the same installation method.

Use `.platform()` for platform- and architecture-specific overrides. The callback receives an `install` function for that specific platform.

```ts
import { Architecture, defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install()
    .bin('tool')
    // macOS-specific installation (different method: brew)
    .platform(Platform.MacOS, (install) => install('brew', { formula: 'tool' }))
    // Linux-specific installation (different method: github-release)
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'owner/tool',
      }))
    // Windows with Arm64
    .platform(Platform.Windows, Architecture.Arm64, (install) =>
      install('github-release', {
        repo: 'owner/tool',
      }))
);
```

Reference: [Platform Support Guide](<root>/docs/platform-support.md)

### Step 6: Add Installation Hooks (if needed)

Use hooks for custom installation logic when fluent configuration is insufficient.

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .hook('after-install', async ({ log, $, installedDir }) => {
    await $`${installedDir}/tool init`;
    log.info('Tool initialized');
  });
```

**Hook Events**: `'before-install'`, `'after-download'`, `'after-extract'`, `'after-install'`

**Executing Installed Binaries**: In `after-install` hooks, the shell's PATH is automatically enhanced to include directories containing installed binaries. You can execute freshly installed tools by name:

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .hook('after-install', async ({ $, log }) => {
    // Binary is automatically available by name - no full path needed
    await $`tool --version`;
    await $`tool init`;
    log.info('Tool initialized');
  });
```

**File Modifications in Hooks**: Use `ctx.replaceInFile()` for regex-based file modifications:

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .hook('after-install', async (ctx) => {
    // Replace a value in a config file (returns true if replaced)
    const wasReplaced = await ctx.replaceInFile(
      `${ctx.installedDir}/config.toml`,
      /default_theme = ".*"/,
      'default_theme = "dark"',
    );

    // Line-by-line replacement with callback
    await ctx.replaceInFile(
      `${ctx.installedDir}/settings.ini`,
      /version=(\d+)/,
      (match) => `version=${Number(match.captures[0]) + 1}`,
      { mode: 'line' },
    );

    // With error message - logs "message: filePath: pattern" if pattern not found
    await ctx.replaceInFile(`${ctx.installedDir}/config.toml`, /api_key = ".*"/, 'api_key = "secret"', {
      errorMessage: 'Could not find api_key setting in config.toml',
    });
  });
```

**`replaceInFile` options:**

- `mode` - `'file'` (default) or `'line'` (process each line separately)
- `errorMessage` - If provided and no matches found, logs error: `Could not find '<pattern>' in <filePath>`

**Returns:** `Promise<boolean>` - `true` if replacements were made, `false` if no matches found

**Resolving Glob Patterns**: Use `ctx.resolve()` to match a glob pattern to a single path:

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh((shell) =>
    shell.always(/* zsh */ `
      # Resolve versioned directory (e.g., tool-14.1.0-x86_64-linux)
      source "${ctx.resolve('completions/*.zsh')}"
    `)
  );
```

`ctx.resolve(pattern)` returns the absolute path if exactly one match is found. It throws `ResolveError` and logs ERROR if:

- No matches are found
- Multiple matches are found (ambiguous)

This is useful for referencing files with variable names (versioned directories, platform-specific assets).

Reference: [Hooks Guide](<root>/docs/hooks.md) and [API Reference](<root>/docs/api-reference.md#hook-event-string-handler-hookhandler)

### Step 7: Disable a Tool (if needed)

Use `.disable()` to temporarily skip a tool during generation without removing its configuration. A warning will be logged when the tool is skipped.

```ts
install('github-release', { repo: 'owner/tool' }).bin('tool').disable(); // Tool will be skipped with a warning
```

This is useful for:

- Temporarily disabling a broken or unavailable tool
- Testing configurations without installing certain tools
- Keeping tool configurations for future use

### Step 8: Restrict to Specific Hosts (if needed)

Use `.hostname(pattern)` to restrict a tool to specific machines. When a hostname is specified, the tool is only installed on machines where the hostname matches the pattern.

```ts
// Exact hostname match
install('github-release', { repo: 'owner/work-tools' })
  .bin('work-tool')
  .hostname('my-work-laptop');

// Regex pattern match (any hostname starting with "work-")
install('github-release', { repo: 'owner/work-tools' })
  .bin('work-tool')
  .hostname(/^work-.*$/);
```

This is useful for:

- Work-specific tools that should only be installed on work machines
- Personal tools that should only be installed on personal machines
- Machine-specific configurations (different tools for laptops vs desktops)

When the hostname doesn't match:

- A warning is logged indicating the tool is being skipped
- Any previously generated artifacts are cleaned up

## Output Requirements

### File Structure

Create a file named `{tool-name}.tool.ts`:

```ts
import { defineTool } from '@gitea/dotfiles';

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
import { defineTool } from '@gitea/dotfiles';

/**
 * ripgrep - A line-oriented search tool that recursively searches your current
 * directory for a regex pattern.
 *
 * https://github.com/BurntSushi/ripgrep
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  }).bin('rg')
);
```

### Example 1b: GitHub Release with gh CLI

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * ripgrep - Using gh CLI for API access (GitHub Enterprise or auth via gh).
 *
 * https://github.com/BurntSushi/ripgrep
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
    ghCli: true, // Use `gh api` instead of direct fetch
  }).bin('rg')
);
```

### Example 2: Tool with Shell Integration

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * fzf - Command-line fuzzy finder.
 *
 * https://github.com/junegunn/fzf
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
    .zsh((shell) =>
      shell
        .env({
          FZF_DEFAULT_OPTS: '--color=fg+:cyan,bg+:black,hl+:yellow',
        })
        .aliases({ f: 'fzf' })
        .completions('completion.zsh') // Resolves to ctx.toolDir/completion.zsh
        .sourceFile('key-bindings.zsh') // Resolves to ctx.toolDir/key-bindings.zsh
    )
);
```

### Example 3: Manual Installation (Dotfiles Script)

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * deploy - Custom deployment script included with dotfiles.
 *
 * https://example.com/deploy
 */
export default defineTool((install) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',
  })
    .bin('deploy')
    .symlink('./deploy.config.yaml', '~/.config/deploy/config.yaml')
);
```

### Example 4: Configuration-Only Tool

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * git - Git configuration and aliases.
 *
 * https://git-scm.com
 */
export default defineTool((install) =>
  install() // Configuration-only: no install params, no .bin()
    .symlink('./gitconfig', '~/.gitconfig')
    .zsh((shell) =>
      shell.aliases({
        g: 'git',
        gs: 'git status',
        ga: 'git add',
        gc: 'git commit',
      })
    )
);
```

### Example 5: Rust Tool with Cargo

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * eza - A modern replacement for ls.
 *
 * https://github.com/eza-community/eza
 */
export default defineTool((install) =>
  install('cargo', {
    crateName: 'eza',
    githubRepo: 'eza-community/eza',
  })
    .bin('eza')
    .zsh((shell) =>
      shell
        .aliases({
          ls: 'eza',
          ll: 'eza -l',
          la: 'eza -la',
          tree: 'eza --tree',
        })
        .completions('_eza') // Resolves to ctx.toolDir/_eza
    )
);
```

### Example 6: Tool with Shell Functions

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * kubectl - Kubernetes command-line tool with custom wrappers.
 *
 * https://kubernetes.io/docs/reference/kubectl/
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'kubernetes/kubectl',
  })
    .bin('kubectl')
    .zsh((shell) =>
      shell
        .env({
          KUBECONFIG: '~/.kube/config',
        })
        .aliases({
          k: 'kubectl',
          kgp: 'kubectl get pods',
        })
        .completions({ cmd: 'kubectl completion zsh' })
        .functions({
          kns: /* zsh */ `
            kubectl config set-context --current --namespace="$1"
          `,
          kctx: /* zsh */ `
            kubectl config use-context "$1"
          `,
        })
    )
);
```

### Example 7: Tool with Dynamic Initialization

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * zoxide - A smarter cd command with frecency tracking.
 *
 * https://github.com/ajeetdsouza/zoxide
 */
export default defineTool((install) =>
  install('github-release', {
    repo: 'ajeetdsouza/zoxide',
  })
    .bin('zoxide')
    .zsh((shell) =>
      shell
        .env({
          _ZO_DATA_DIR: '~/.local/share/zoxide',
        })
        .completions({ cmd: 'zoxide completions zsh' }).always(/* zsh */ `
          # Initialize zoxide with cd replacement
          eval "$(zoxide init zsh --cmd cd)"
        `)
    )
);
```

### Example 8: Zsh Plugin (Git Repository)

```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * zsh-vi-mode - A better and friendly vi(vim) mode plugin for ZSH.
 *
 * https://github.com/jeffreytse/zsh-vi-mode
 */
export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) =>
      shell.env({
        ZVM_VI_INSERT_ESCAPE_BINDKEY: 'jj',
        ZVM_CURSOR_STYLE_ENABLED: 'false',
      })
    )
);
```

## Quality Checklist

**Installation & binaries**

- ✅ Installation method matches the tool's official distribution
- ✅ `.bin(name, pattern?)` declarations match actual executables
- ✅ Binary patterns are correct for archive structures
- ✅ `.dependsOn()` uses binary names (not tool names) from other tools' `.bin()` declarations

**Paths**

- ✅ Use `ctx.toolDir` for files next to `.tool.ts` (tool configuration directory)
- ✅ Use `ctx.currentDir` for installed assets (stable symlink to versioned directory)
- ✅ For symlink targets and environment variables: use `~/` (tilde expansion is automatic)
- ✅ All relative paths (`.completions()`, `.sourceFile()`, `.symlink()`) resolve to `toolDir`
- ✅ For archive files, use `ctx.currentDir` to build absolute paths
- ✅ Never use hardcoded absolute paths like `/home/user/...`

**Shell integration**

- ✅ Use `.completions({ cmd: '...' })` for dynamic completions (not `.once()`)
- ✅ Use `.once()` only for expensive one-time setup (cache building, initialization)
- ✅ Use `.always()` for fast runtime setup (environment, eval statements)
- ✅ Use `.functions()` for shell function wrappers
- ✅ Shell scripts are fast and use context variables
- ✅ Completions configured within shell blocks (`.zsh()`, `.bash()`, `.powershell()`)

**Function signature**

- ✅ Import `defineTool` from `'@gitea/dotfiles'`
- ✅ Use `export default defineTool((install, ctx) => ...)` - omit `ctx` if not used
- ✅ Call `install(method, params)` first to specify installation
- ✅ Chain additional configuration methods

## References

**Core Documentation**

- [API Reference](<root>/docs/api-reference.md) - Complete API with all parameters
- [Getting Started](<root>/docs/getting-started.md) - Basic structure and anatomy
- [Context API](<root>/docs/context-api.md) - Path resolution and context variables

**Configuration Guides**

- [Common Patterns](<root>/docs/common-patterns.md) - Real-world examples
- [Shell Integration](<root>/docs/shell-integration.md) - Shell configuration, symlinks
- [Completions](<root>/docs/completions.md) - Command completion setup

**Installation Methods**

- [GitHub Release Installation](<root>/docs/installation/github-release.md)
- [Homebrew Installation](<root>/docs/installation/homebrew.md)
- [Cargo Installation](<root>/docs/installation/cargo.md)
- [Curl Script Installation](<root>/docs/installation/curl-script.md)
- [Curl Tar Installation](<root>/docs/installation/curl-tar.md)
- [Manual Installation](<root>/docs/installation/manual.md)
- [Zsh Plugin Installation](<root>/docs/installation/zsh-plugin.md)

**Other Resources**

- [Platform Support](<root>/docs/platform-support.md) - Platform-specific configurations
- [Hooks](<root>/docs/hooks.md) - Installation lifecycle hooks
- [Troubleshooting](<root>/docs/troubleshooting.md) - Common issues and solutions
