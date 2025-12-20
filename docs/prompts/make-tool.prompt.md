---
agent: agent
---
# LLM Agent Instructions: Create `.tool.ts` Configuration

## Mission
Create a complete, working `.tool.ts` configuration file for a CLI tool.

Your job is to analyze the tool and its distribution method, then generate a configuration that follows the repository’s best practices.

## Input
You will receive:
- **Tool Source**: a URL (GitHub repo, homepage) or a tool name.
- **Tool Name** (optional): if not provided, derive it from the source.

## Required Analysis Steps

### 1) Tool Investigation
Analyze the tool’s source and documentation to understand:
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
  - Guide: [GitHub Release Installation Guide](../installation/github-release.md)

- **`brew`**: use if the tool is officially available on Homebrew.
  - Guide: [Homebrew Installation Guide](../installation/homebrew.md)

- **`cargo`**: prefer for Rust tools available on crates.io.
  - Guide: [Cargo Installation Guide](../installation/cargo.md)

- **`curl-script`**: for tools with an official install script.
  - Guide: [Curl Script Installation Guide](../installation/curl-script.md)

- **`curl-tar`**: for direct archive downloads from a stable URL.
  - Guide: [Curl Tar Installation Guide](../installation/curl-tar.md)

- **`manual`**: for custom install logic or dotfiles-provided binaries/scripts.
  - Guide: [Manual Installation Guide](../installation/manual.md)

### Step 2: Configure Binary Specification
**Important**: `.bin()` declares which executables the tool provides. It does not describe archive layouts.

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool');

install('github-release', { repo: 'owner/tool' })
  .bin(['tool', 'tool-helper']);
```

**Installation directory vs tool config directory**:
- `ctx.toolDir` is the directory containing the current `.tool.ts` file (tool configuration directory).
- `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}` is the tool’s base installation directory (contains version subdirectories).

If you need to reference files next to the tool config, use `ctx.toolDir`.

**Custom binary patterns**: only use these when the default binary discovery does not work.

Reference: [Path Resolution Guide](../path-resolution.md)

### Step 3: Add Shell Integration
Use the fluent shell configurator.

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh((shell) =>
    shell
      .completions('completions/_tool')
      .environment({
        TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`,
        TOOL_CONFIG_DIR: ctx.toolDir,
      })
      .aliases({
        t: 'tool',
        ts: 'tool status',
      })
  );
```

Use `.once()` for expensive operations (runs after install/update) and `.always()` for fast runtime setup.

Reference: [Shell Integration Guide](../shell-integration.md)

### Step 4: Configure File Management (Symlinks)
Symlink sources starting with `./` are relative to the tool config directory (same directory as the `.tool.ts` file).

```ts
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
  .symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/tool/themes`);
```

Reference: [Symlinks Guide](../symlinks.md)

### Step 5: Add Platform Support
Use `.platform()` for platform- and architecture-specific overrides.

Reference: [Platform Support Guide](../platform-support.md)

### Step 6: Add Installation Hooks (if needed)
Use hooks only when the fluent configuration is insufficient.

Reference: [Hooks Guide](../hooks.md)

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
- Key features (if notable).
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

### Example 2: Tool with Shell Integration
```ts
import { defineTool } from '@gitea/dotfiles';

/**
 * fzf - Command-line fuzzy finder.
 *
 * Features: key bindings, completions, and custom functions.
 *
 * https://github.com/junegunn/fzf
 */
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
    .zsh((shell) =>
      shell
        .completions('shell/completion.zsh')
        .environment({
          FZF_DEFAULT_OPTS: '--color=fg+:cyan,bg+:black,hl+:yellow',
          FZF_CONFIG_DIR: ctx.toolDir,
        })
        .always(/* zsh */`
          if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.toolDir}/shell/key-bindings.zsh"
          fi
        `)
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
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',
  })
    .bin('deploy')
    .symlink('./deploy.config.yaml', `${ctx.projectConfig.paths.homeDir}/.config/deploy/config.yaml`)
);
```

## Quality Checklist

**Installation & binaries**
- Installation method matches the tool’s official distribution.
- `.bin()` names match actual executables.

**Paths**
- Use `ctx.toolDir` for files next to `.tool.ts`.
- Use `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}` for installed artifacts.
- Use `${ctx.projectConfig.paths.homeDir}` for user home paths.

**Shell integration**
- Use `.once()` only for expensive operations.
- Keep `.always()` fast.

## References
- [Common Patterns](../common-patterns.md)
- [Examples](../examples.md)
- [API Reference](../api-reference.md)
- [Troubleshooting](../troubleshooting.md)
