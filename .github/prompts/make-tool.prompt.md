---
mode: agent
---
# LLM Agent Instructions: Create .tool.ts Configuration

## Mission
You are tasked with creating a `.tool.ts` configuration file. Your goal is to analyze the tool and its distribution method to generate a complete, working tool configuration that follows best practices.

## Input
You will receive:
- **Tool Source**: A URL to a GitHub repository, a homepage, or simply the name of the tool.
- **Tool Name** (optional): If not provided, derive it from the source.

## Required Analysis Steps

### 1. Tool Investigation
Analyze the tool's source and documentation to understand:
- **Tool Purpose**: What does this tool do?
- **Primary Distribution Method**: How is it typically installed? Check for official installation instructions.
- **Package Managers**: Is it available on Homebrew, Cargo, or other package managers?
- **Release Assets**: If distributed via GitHub releases, what files are available?
- **Binary Names**: What executables does it provide?
- **Platform Support**: Which platforms (macOS, Linux, Windows) and architectures (x86_64, ARM64) are supported?
- **Dependencies**: Does it have any special requirements (e.g., specific libraries, language runtimes)?

### 2. Release Asset Analysis (if applicable)
If the tool uses GitHub releases, examine the latest release to determine:
- **Asset Naming Patterns**: How are release files named? (e.g., `tool-v1.2.3-x86_64-unknown-linux-gnu.tar.gz`)
- **Archive Structure**: What is the directory structure inside the downloaded archives (`.tar.gz`, `.zip`)?
- **Binary Locations**: Where are the executables located within the archives?
- **Platform Variants**: Are there different files for different platforms and architectures?

### 3. Tool Behavior Analysis
Research the tool to understand:
- **Command-line Interface**: What are the common commands and options?
- **Configuration Files**: Does it use configuration files? Where are they expected to be located?
- **Shell Integration**: Does it provide completions, aliases, or functions?
- **Environment Variables**: Does it use any environment variables for configuration?

## Configuration Generation Process

### Step 1: Choose the Best Installation Method
Based on your analysis, select the most appropriate installation method. Prioritize official and pre-compiled options.

- **`github-release`**: Best for tools with binary releases on GitHub. It's the most common method.
  - See: [GitHub Release Installation Guide](../../docs/installation/github-release.md)
- **`brew`**: Use if the tool is officially available via Homebrew and the target platform is macOS or Linux.
  - See: [Homebrew Installation Guide](../../docs/installation/homebrew.md)
- **`cargo`**: The preferred method for Rust-based tools available on crates.io, as it's generally faster.
  - See: [Cargo Installation Guide](../../docs/installation/cargo.md)
- **`curl-script`**: For tools that provide an official installation script (e.g., `install.sh`).
  - See: [Curl Script Installation Guide](../../docs/installation/curl-script.md)
- **`curl-tar`**: For downloading and extracting archives from a direct URL.
  - See: [Curl Tar Installation Guide](../../docs/installation/curl-tar.md)
- **`manual`**: For tools that are already installed on the system, custom scripts, or configuration-only tools.
  - With binary: Copies binaries from your dotfiles directory  
  - Configuration-only: Just manages shell integration and symlinks
  - See: [Manual Installation Guide](../../docs/installation/manual.md)

### Step 2: Configure Binary Patterns
If using an archive-based installer (`github-release`, `curl-tar`), specify binary patterns based on the archive's structure.

```typescript
// Examples of common patterns:
c.bin('tool')                    // Default: '{,*/}tool' (matches both 'tool' and '*/tool')
c.bin('tool', 'tool-*/tool')     // Versioned directory name (e.g., tool-1.2.3/tool)
c.bin('tool', '*/bin/tool')      // Binary in a 'bin' subdirectory
c.bin('tool', 'tool')            // Binary exactly at the archive root (no subdirectory)
```

**Note**: The default pattern `{,*/}tool` handles both flat archives (binary at root) and nested archives (binary in a subdirectory), covering most common cases automatically.

**Reference**: [Path Resolution Guide](../../docs/path-resolution.md)

### Step 3: Add Shell Integration
Configure shell features if the tool provides them.

```typescript
// Shell completions (shell-specific)
c.zsh({
  completions: {
    source: 'completions/_tool' // Path inside the archive
  }
})
.bash({
  completions: {
    cmd: 'tool completion bash' // Command to generate completions
  }
})

// Aliases and Environment variables
.zsh({
  aliases: { t: 'tool' },
  environment: { TOOL_CONFIG: '~/.config/tool' },
  shellInit: [
    once/* zsh */`
      # Expensive setup only runs once after install
      tool setup --user
    `,
  ],
});
```

**Reference**: [Shell Integration Guide](../../docs/shell-integration.md)

### Step 4: Configure File Management
Set up symbolic links for configuration files if the tool uses them.

```typescript
c.symlink('./config.toml', '~/.config/tool/config.toml')
```

**Reference**: [Symlinks Guide](../../docs/symlinks.md)

### Step 5: Add Platform Support
Handle platform-specific requirements using `.platform()`.

```typescript
c.platform(Platform.MacOS, (c) => {
  c.install('brew', { formula: 'tool' }); // macOS-specific installation
});
c.platform(Platform.Linux, (c) => {
  c.install('github-release', { repo: 'owner/repo' }); // Linux-specific
});
```

**Reference**: [Platform Support Guide](../../docs/platform-support.md)

### Step 6: Add Installation Hooks (if needed)
Include post-installation setup for tasks like creating directories or running initialization commands.

```typescript
c.hooks({
  afterInstall: async ({ $, logger }) => {
    logger.info('Running post-install setup...');
    await $`tool init`;
  }
})
```

**Reference**: [Hooks Guide](../../docs/hooks.md)

## Output Requirements

### File Structure
Create a file named `{tool-name}.tool.ts` with this structure:

```typescript
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  // Your configuration here
);
```

### Required Elements
Your configuration MUST include:
1. **Binary configuration** (`.bin()`) with correct patterns if applicable.
2. **Installation method** (`.install()`) with proper parameters.
3. **Version specification** (`.version()`).

### Optional Elements (include if applicable):
1. **Shell completions**, aliases, and environment variables.
2. **Configuration symlinks**.
3. **Platform-specific overrides**.
4. **Installation hooks** for custom setup.

### Documentation Comments
Include a brief JSDoc comment explaining:
- What the tool does.
- Any special configuration decisions made.
- Platform-specific notes if applicable.

## Example Output

```typescript
import { defineTool } from '@dotfiles/schemas';

/**
 * ripgrep - A line-oriented search tool that recursively searches your current
 * directory for a regex pattern.
 * GitHub releases contain platform-specific archives with the binary in a subdirectory.
 */
export default defineTool((c, ctx) =>
  c
    .bin('rg')  // Default pattern {,*/}rg handles ripgrep's archive structure
    .version('latest')
    .install('github-release', {
      repo: 'BurntSushi/ripgrep',
    })
    .bash({
      completions: {
        source: 'complete/rg.bash',
      },
    })
    .zsh({
      completions: {
        source: 'complete/_rg',
      },
    })
);
```

## Quality Checklist

Before finalizing your configuration, verify:
- [ ] **Installation method** is the most appropriate for the tool.
- [ ] **Binary patterns** match the actual archive structure.
- [ ] **Repository URL** or package name is correct.
- [ ] **Version specification** is appropriate (`latest` vs. a specific version).
- [ ] **Shell integration** includes available completions and useful aliases.
- [ ] **Platform support** covers all intended platforms.
- [ ] **Configuration follows** [TypeScript requirements](../../docs/typescript.md).
- [ ] **Code style** matches [examples](../../docs/examples.md).

## Common Patterns Reference

For quick reference, see these common configuration patterns:
- **[Common Patterns Guide](../../docs/common-patterns.md)** - Real-world examples.
- **[Configuration Examples](../../docs/examples.md)** - Template configurations.
- **[API Reference](../../docs/api-reference.md)** - Complete method documentation.

## Troubleshooting

If you encounter issues:
1. **Archive structure unclear**: Download and inspect the actual release assets manually.
2. **Multiple binaries**: Use chained `.bin()` calls for each executable.
3. **Complex installation**: Use hooks for custom setup scripts.
4. **Platform differences**: Use `.platform()` for platform-specific overrides.

**Reference**: [Troubleshooting Guide](../../docs/troubleshooting.md)

## Success Criteria

Your generated configuration is successful if:
1. The tool installs correctly on all target platforms.
2. The binaries are accessible via the generated shims.
3. Shell integration (completions, aliases) works as expected.
4. The configuration follows established patterns and best practices.
5. The code is clean, maintainable, and well-documented.

## Additional Resources

- **[Getting Started](../../docs/getting-started.md)** - Basic configuration concepts.
- **[Advanced Topics](../../docs/advanced-topics.md)** - Complex scenarios.
- **[Testing Guide](../../docs/testing.md)** - Validation approaches.

---

**Remember**: Focus on creating a working, maintainable configuration that follows established patterns. When in doubt, prefer simpler approaches and refer to the detailed guides for specific topics.
