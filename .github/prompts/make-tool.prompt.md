---
agent: agent
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
  - Downloads from GitHub releases with automatic platform detection
  - Supports custom asset patterns and selectors
  - See: [GitHub Release Installation Guide](../../docs/installation/github-release.md)
  
- **`brew`**: Use if the tool is officially available via Homebrew and the target platform is macOS or Linux.
  - Automatic dependency management
  - Native integration with macOS and Linux
  - Automatic version tracking via `brew info --json`
  - See: [Homebrew Installation Guide](../../docs/installation/homebrew.md)
  
- **`cargo`**: The preferred method for Rust-based tools available on crates.io.
  - Uses cargo-quickinstall or GitHub releases for pre-compiled binaries
  - Multiple version sources (Cargo.toml, crates.io, GitHub)
  - Automatic platform-to-Rust target mapping
  - See: [Cargo Installation Guide](../../docs/installation/cargo.md)
  
- **`curl-script`**: For tools that provide an official installation script.
  - Executes installation scripts (bash, sh)
  - Supports custom environment variables
  - See: [Curl Script Installation Guide](../../docs/installation/curl-script.md)
  
- **`curl-tar`**: For downloading and extracting archives from a direct URL.
  - Direct tarball downloads from known URLs
  - Simple archive extraction
  - See: [Curl Tar Installation Guide](../../docs/installation/curl-tar.md)
  
- **`manual`**: For custom scripts and pre-built binaries stored in your dotfiles.
  - Copies binaries from your dotfiles directory to managed installation
  - See: [Manual Installation Guide](../../docs/installation/manual.md)

- **Configuration-only**: For shell-only tools (no installation, no shims).
  - Use `install()` with no arguments and do not call `.bin()`

### Step 2: Configure Binary Specification
**IMPORTANT**: The `.bin()` method only declares which executables your tool provides. It does NOT specify paths inside archives.

```typescript
// Declare the binaries this tool provides
install('github-release', { repo: 'owner/tool' })
  .bin('tool')                    // Single binary
  
install('github-release', { repo: 'owner/tool' })
  .bin(['tool', 'tool-helper'])   // Multiple binaries

// For github-release and curl-tar, the system automatically:
// 1. Extracts archives to ${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/version/
// 2. Preserves complete archive structure
// 3. Uses pattern {,*/}binary-name to locate executables
// 4. Creates shims in ${ctx.projectConfig.paths.targetDir}/ that execute from original location
```

**Archive Structure Handling**: The default pattern `{,*/}binary-name` automatically handles:
- Flat archives: `binary` at root
- Nested archives: `directory/binary` in subdirectory
- Complex structures: Any single-level nesting

**Custom Binary Patterns**: Only needed for non-standard archive structures:
```typescript
// Binary in versioned directory (e.g., tool-1.2.3/tool)
install('github-release', { repo: 'owner/tool' })
  .bin('tool', 'tool-*/tool')

// Binary in specific subdirectory path
install('github-release', { repo: 'owner/tool' })
  .bin('tool', 'bin/tool')
```

**Reference**: [Path Resolution Guide](../../docs/path-resolution.md)

### Step 3: Add Shell Integration
Configure shell features using both declarative and script-based approaches.

**Declarative Configuration** (preferred for simple cases):
```typescript
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh({
    // Shell completions
    completions: {
      source: 'completions/_tool'  // Path inside extracted archive
    },
    
    // Environment variables (structured object)
    environment: {
      'TOOL_CONFIG': `${ctx.projectConfig.paths.homeDir}/.config/tool`,
      'TOOL_LOG_LEVEL': 'info'
    },
    
    // Aliases (structured object)
    aliases: {
      't': 'tool',
      'ts': 'tool status'
    }
  })
```

**Script-Based Configuration** (for complex logic):
```typescript
import { always, once } from '@gitea/dotfiles';

install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh({
    shellInit: [
      // Expensive operations (run once after install/update)
      once/* zsh */`
        tool gen-completions --shell zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
      `,
      
      // Fast runtime setup (runs every shell startup)
      always/* zsh */`
        function tool-helper() {
          tool --config "$TOOL_CONFIG" "$@"
        }
        
        # Key bindings
        bindkey '^T' tool-fuzzy-search
      `
    ]
  })
```

**Cross-Shell Support**:
```typescript
// Apply same config to multiple shells
const commonConfig = {
  environment: { 'TOOL_HOME': `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}` },
  aliases: { 't': 'tool' }
};

install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .zsh(commonConfig)
  .bash(commonConfig)
  .powershell(commonConfig);
```

**Reference**: [Shell Integration Guide](../../docs/shell-integration.md)

### Step 4: Configure File Management
Set up symbolic links for configuration files if the tool uses them.

**Path Resolution Rules**:
- **Source paths** starting with `./`: Relative to tool configuration directory (where `.tool.ts` is located)
- **Target paths**: Must be absolute (use `${ctx.projectConfig.paths.homeDir}`, etc.)

```typescript
// Link configuration files
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
  .symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/tool/themes`)

// Directory structure example:
// configs/my-tool/
// ├── my-tool.tool.ts
// ├── config.toml       <- Source: './config.toml'
// └── themes/           <- Source: './themes/'
```

**Reference**: [Symlinks Guide](../../docs/symlinks.md)

### Step 5: Add Platform Support
Handle platform-specific requirements using `.platform()`.

**Platform Enumeration** (bitwise flags):
```typescript
import { Platform, Architecture } from '@gitea/dotfiles';

Platform.Linux    // 1
Platform.MacOS    // 2  
Platform.Windows  // 4
Platform.Unix     // Platform.Linux | Platform.MacOS (3)
Platform.All      // Platform.Linux | Platform.MacOS | Platform.Windows (7)

Architecture.X86_64  // 1
Architecture.Arm64   // 2
Architecture.All     // Architecture.X86_64 | Architecture.Arm64 (3)
```

**Platform-Specific Configuration**:
```typescript
// Platform-only configuration
install()
  .platform(Platform.MacOS, (install) => {
    install('brew', { formula: 'tool' })
      .bin('tool');
  })
  .platform(Platform.Linux, (install) => {
    install('github-release', { repo: 'owner/tool' })
      .bin('tool');
  });

// Platform + Architecture
install()
  .platform(Platform.Linux, Architecture.Arm64, (install) => {
    install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux-arm64*.tar.gz'
    })
      .bin('tool');
  });

// Multiple platforms
install()
  .platform(Platform.Unix, (install) => {
    // Applies to both Linux and macOS
    install('github-release', { repo: 'owner/tool' })
      .bin('tool')
      .zsh({ aliases: { 't': 'tool' } });
  });
```

**Reference**: [Platform Support Guide](../../docs/platform-support.md)

### Step 6: Add Installation Hooks (if needed)
Include post-installation setup for custom operations.

**Available Hooks**:
```typescript
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .hooks({
    beforeInstall: async (ctx) => { /* Pre-installation setup */ },
    afterDownload: async (ctx) => { /* Post-download processing */ },
    afterExtract: async (ctx) => { /* Post-extraction setup */ },
    afterInstall: async (ctx) => { /* Final setup and verification */ }
  })
```

**Hook Context Provides**:
- `$`: Bun's shell executor (cwd is tool config directory)
- `fileSystem`: Cross-platform file operations
- `logger`: Structured logging (use `logger.info()`, `logger.warn()`, `logger.error()`)
- `toolName`, `currentDir`, `systemInfo`: Installation metadata
- `downloadPath`, `extractDir`, `extractResult`: Stage-specific paths

**Common Hook Patterns**:
```typescript
install('github-release', { repo: 'owner/tool' })
  .bin('tool')
  .hooks({
    afterInstall: async ({ $, logger, fileSystem, systemInfo }) => {
      // Create data directory
      const dataDir = path.join(systemInfo.homeDir, '.local/share', 'tool');
      await fileSystem.mkdir(dataDir, { recursive: true });
      
      // Initialize tool
      await $`tool init --data-dir ${dataDir}`;
      
      // Generate completions
      await $`tool completion zsh > ${ctx.projectConfig.paths.generatedDir}/completions/_tool`;
      
      logger.info('Post-install setup completed');
    }
  })
```

**Shell Executor (`$`) Notes**:
- Automatically uses tool config directory as `cwd`
- Returns promises with stdout (Buffer), stderr, exitCode
- Use `.text()` for string output: `await $`command`.text()`
- Always handle errors with try/catch

**Reference**: [Hooks Guide](../../docs/hooks.md)

## Output Requirements

### File Structure
Create a file named `{tool-name}.tool.ts` with this structure:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  // Your configuration here
);
```

### Required Elements
Your configuration MUST include:
1. **Binary configuration** (`.bin()`) with correct patterns if applicable.
2. **Installation method** (`install()`) with proper parameters.

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

### Example 1: Simple GitHub Release Tool
```typescript
import { defineTool } from '@gitea/dotfiles';

/**
 * ripgrep - A line-oriented search tool that recursively searches your current
 * directory for a regex pattern.
 * 
 * Installation: Downloads from GitHub releases with automatic platform detection.
 * Archive Structure: Binary in subdirectory (handled by default pattern).
 */
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    .bin('rg')  // Default pattern {,*/}rg handles ripgrep's archive structure
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

### Example 2: Tool with Shell Integration
```typescript
import { defineTool, always, once } from '@gitea/dotfiles';

/**
 * fzf - Command-line fuzzy finder.
 * 
 * Installation: GitHub release with shell integration.
 * Features: Key bindings, completions, and custom functions.
 */
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
    .zsh({
      completions: {
        source: 'shell/completion.zsh',
      },
      environment: {
        'FZF_DEFAULT_OPTS': '--color=fg+:cyan,bg+:black,hl+:yellow',
      },
      shellInit: [
        always/* zsh */`
          # Source key bindings
          if [[ -f "${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/latest/shell/key-bindings.zsh" ]]; then
            source "${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/latest/shell/key-bindings.zsh"
          fi
          
          # Custom function
          function fzf-jump-to-dir() {
            local dir=$(find . -type d | fzf)
            [[ -n "$dir" ]] && cd "$dir"
          }
        `
      ]
    })
);
```

### Example 3: Cross-Platform Tool
```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';

/**
 * bat - A cat clone with syntax highlighting and Git integration.
 * 
 * Installation: Platform-specific (Homebrew on macOS, GitHub on Linux).
 * Platforms: macOS, Linux (x86_64 and ARM64).
 */
export default defineTool((install, ctx) =>
  install()
    .platform(Platform.MacOS, (install) => {
      install('brew', { formula: 'bat' })
        .bin('bat');
    })
    .platform(Platform.Linux, Architecture.X86_64, (install) => {
      install('github-release', {
        repo: 'sharkdp/bat',
        assetPattern: '*linux-gnu*.tar.gz',
      })
        .bin('bat');
    })
    .platform(Platform.Linux, Architecture.Arm64, (install) => {
      install('github-release', {
        repo: 'sharkdp/bat',
        assetPattern: '*aarch64*linux-gnu*.tar.gz',
      })
        .bin('bat');
    })
    .zsh({
      aliases: {
        'cat': 'bat',
      },
      completions: {
        source: 'autocomplete/bat.zsh',
      },
    })
    .bash({
      completions: {
        source: 'autocomplete/bat.bash',
      },
    })
);
```

### Example 4: Rust Tool with Cargo
```typescript
import { defineTool } from '@gitea/dotfiles';

/**
 * eza - Modern replacement for ls with Git integration.
 * 
 * Installation: Via cargo-quickinstall for fast pre-compiled installation.
 * Features: Multiple binary names (eza and legacy exa).
 */
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'eza',
    githubRepo: 'eza-community/eza',
  })
    .bin(['eza', 'exa'])  // Provides both new and legacy names
    .zsh({
      completions: {
        source: 'completions/zsh/_eza',
      },
      aliases: {
        'ls': 'eza',
        'll': 'eza -l',
        'la': 'eza -la',
        'tree': 'eza --tree',
      },
      environment: {
        'EZA_COLORS': 'da=1;34:gm=1;34',
      },
    })
);
```

### Example 5: Manual Installation (Custom Script)
```typescript
import { defineTool, always } from '@gitea/dotfiles';

/**
 * deploy - Custom deployment script included with dotfiles.
 * 
 * Installation: Manual (copies script from dotfiles directory).
 * Features: Custom deployment commands with configuration.
 */
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/deploy.sh',  // Relative to .tool.ts
  })
    .bin('deploy')
    .symlink('./deploy.config.yaml', `${ctx.projectConfig.paths.homeDir}/.config/deploy/config.yaml`)
    .zsh({
      aliases: {
        'dp': 'deploy',
        'deploy-prod': 'deploy --env production',
        'deploy-staging': 'deploy --env staging',
      },
      environment: {
        'DEPLOY_CONFIG': `${ctx.projectConfig.paths.homeDir}/.config/deploy/config.yaml`,
      },
      shellInit: [
        always/* zsh */`
          function deploy-status() {
            deploy status "$@"
          }
        `
      ],
    })
);
```

### Example 6: Configuration-Only Tool
```typescript
import { defineTool } from '@gitea/dotfiles';

/**
 * git-config - Git aliases (no installation).
 *
 * Installation: None (configuration-only).
 * Features: Shell aliases and environment.
 */
export default defineTool((install, ctx) =>
  install()
    .zsh({
      aliases: {
        'g': 'git',
        'gs': 'git status',
        'ga': 'git add',
        'gc': 'git commit',
        'gp': 'git push',
        'gl': 'git pull',
        'gd': 'git diff',
        'gb': 'git branch',
        'gco': 'git checkout',
      },
      environment: {
        'GIT_EDITOR': 'nvim',
      },
    })
);
```

## Quality Checklist

Before finalizing your configuration, verify:

**Installation & Binary Management:**
- [ ] **Installation method** is the most appropriate (GitHub release, Homebrew, Cargo, etc.)
- [ ] **Binary names** are correctly specified with `.bin()`
- [ ] **Binary patterns** are only used when default `{,*/}name` doesn't work
- [ ] **Repository URL** or package name is correct
- [ ] **Version specification** is appropriate (`latest` vs. specific version)

**Shell Integration:**
- [ ] **Declarative config** is used for simple environment variables and aliases
- [ ] **Script-based config** is used only for complex functions and logic
- [ ] **`once` scripts** contain expensive operations (completions generation, cache building)
- [ ] **`always` scripts** contain only fast runtime setup
- [ ] **Context variables** (`${ctx.projectConfig.paths.homeDir}`, etc.) are used for all paths

**File Management:**
- [ ] **Symlink source paths** use `./` for relative paths to tool config directory
- [ ] **Symlink target paths** use absolute paths with context variables
- [ ] **Completions** use shell-specific configuration (not standalone `.completions()`)

**Cross-Platform Support:**
- [ ] **Platform enumeration** uses `Platform.MacOS`, `Platform.Linux`, etc.
- [ ] **Architecture handling** is specified when needed
- [ ] **Platform-specific overrides** are properly configured

**Code Quality:**
- [ ] **TypeScript requirements** are followed (proper imports, function signature)
- [ ] **Code style** matches [examples](../../docs/examples.md)
- [ ] **Documentation comments** explain the tool and any special decisions
- [ ] **Context API** is used correctly for path resolution

**Testing:**
- [ ] Configuration compiles without TypeScript errors
- [ ] Installation works on target platforms
- [ ] Binaries are accessible after installation
- [ ] Shell integration works as expected
- [ ] All paths resolve correctly

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
