# Command Completions

Command completions make your tools more user-friendly by providing tab completion support in different shells. Completions are configured as part of shell-specific configuration since completion formats and loading mechanisms differ between shells.

## Shell-Specific Configuration

Completions are configured within each shell's configuration using the `completions` property:

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
.powershell((shell) => shell.completions('completions/tool.ps1'));
```

## Completion Configuration

Each shell's completion configuration uses a `ShellCompletionConfig` object:

```typescript
{
  source?: string,     // Path to completion file relative to extracted archive
  cmd?: string,        // Command to execute to generate completion content
  bin?: string,        // Binary name for completion filename (when different from tool name)
  name?: string,       // Optional custom name for installed completion file
  targetDir?: string   // Optional custom installation directory (absolute path)
}
```

**Note**: Either `source` OR `cmd` must be provided, but not both.

## Parameters

- **`source`**: Path to completion file **relative to the extracted archive root**
  - The path is resolved during installation when the archive is extracted
  - **Supports glob patterns** using minimatch syntax (wildcards: `*`, `?`, `[...]`)
  - Example: `'completions/_tool.zsh'` looks for the file in the extracted archive at `<extract-dir>/completions/_tool.zsh`
  - Example: `'*/complete/_tool'` matches `tool-1.0.0-darwin/complete/_tool` or any versioned directory
  - Example: `'shell/completion.zsh'` looks for the file at `<extract-dir>/shell/completion.zsh`
  - **No context variables needed** - the system automatically resolves this relative to where the archive was extracted
  - Falls back to checking relative to the config file if not found in extracted archive
- **`cmd`**: Command to execute to generate completion content dynamically
  - Example: `'my-tool completion zsh'` executes the tool's completion command
  - Example: `'kubectl completion bash'` generates Kubernetes completions
  - The command is executed in the tool's installation directory
- **`bin`**: Binary name used for completion filename (defaults to tool name if not specified)
  - Example: `bin: 'fnm'` results in `_fnm` for zsh, `fnm.bash` for bash
  - Use this when the tool filename differs from the binary name (e.g., `curl-script--fnm.tool.ts` defines binary `fnm`)
  - Shell-specific naming conventions are applied automatically
- **`name`**: Optional custom name for the installed completion file (overrides `bin` and default naming)
  - Example: `name: '_my-custom-name'` results in exactly `_my-custom-name`
- **`targetDir`**: Optional custom installation directory using **absolute paths** with context variables
  - Example: `targetDir: \`\${ctx.projectConfig.paths.homeDir}/.zsh/completions\``
  - If not specified, defaults to the shell-specific completion directory in your generated files

## Completion Methods

### Static Completions from Downloaded Archive (source)

Use `source` when completion files are included in the tool's release archive. The path is relative to the extracted archive root and is automatically resolved during installation:

```typescript
// For a tool downloaded from GitHub releases
.zsh((shell) => shell.completions('completions/_tool.zsh'))
```

**How it works:**
1. Tool archive is downloaded and extracted to a timestamped directory
2. During installation, the system looks for `<extract-dir>/completions/_tool.zsh`
3. The completion file is symlinked to the shell-specific completion directory
4. No context variables needed - all path resolution happens automatically

### Dynamic Completions (cmd)

Use `cmd` when the tool can generate completions dynamically at installation time:

```typescript
.zsh((shell) => shell.completions({ cmd: 'my-tool completion zsh' }))
```

**How it works:**
1. After installation, the command is executed in the tool's installation directory
2. The output is captured and saved as a completion file
3. Useful for tools that generate shell-specific completions on-demand

## Basic Examples

### Command-Generated Completions

```typescript
.zsh((shell) => shell.completions({ cmd: 'kubectl completion zsh' }))
.bash((shell) => shell.completions({ cmd: 'kubectl completion bash' }))
.powershell((shell) => shell.completions({ cmd: 'kubectl completion powershell' }));
```

### Static File Completions

```typescript
// Simple path
.zsh((shell) => shell.completions('completions/_tool.zsh'));

// With glob pattern to match versioned directories
.zsh((shell) => shell.completions('*/complete/_tool'));
```

### Multiple Shell Support

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
.powershell((shell) => shell.completions('completions/tool.ps1'));
```

### Custom Completion Names

```typescript
.zsh((shell) => shell.completions({
  source: 'autocomplete/complete.zsh',
  name: '_my-tool'
}));
```

### Binary Name Different from Tool Name

When your tool file is named differently from the binary (e.g., `curl-script--fnm.tool.ts` for binary `fnm`):

```typescript
// The tool file is curl-script--fnm.tool.ts, but the binary is 'fnm'
.zsh((shell) => shell.completions({ 
  cmd: 'fnm completions --shell zsh',
  bin: 'fnm'  // Results in '_fnm' instead of '_curl-script--fnm'
}))
.bash((shell) => shell.completions({ 
  cmd: 'fnm completions --shell bash',
  bin: 'fnm'  // Results in 'fnm.bash'
}));
```

### Custom Installation Directory

Specify where completion files should be installed using context variables for absolute paths:

```typescript
.zsh((shell) => shell.completions({
  source: 'completions/tool.zsh',  // Relative to extracted archive
  targetDir: `${ctx.projectConfig.paths.homeDir}/.zsh/completions`  // Absolute path using context
}))
```

**Note:** The `source` path is always relative to the extracted archive and doesn't need context variables. Only `targetDir` uses context variables to specify absolute installation paths.

## Generated Completions

Some tools can generate their own completions. Use shell initialization scripts for this:

```typescript
.zsh((shell) =>
  shell.once(/* zsh */`
    # Generate completions once after installation
    if command -v tool >/dev/null 2>&1; then
      tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
    fi
  `)
);
```

## Shell-Specific Integration

### Zsh Completions

Zsh completions are automatically loaded from the generated completions directory. The completion files should follow zsh completion conventions:

```typescript
.zsh((shell) => shell.completions('completions/_tool'));
```

### Bash Completions

Bash completions are sourced during shell initialization:

```typescript
.bash((shell) => shell.completions('completions/tool.bash'));
```

### PowerShell Completions

PowerShell completions are loaded during shell initialization:

```typescript
.powershell((shell) => shell.completions('completions/tool.ps1'));
```

## Path Resolution

### Source Path Resolution (Automatic)

When you specify `source: 'completions/_tool.zsh'`, the system automatically resolves this during installation:

1. **Glob pattern matching**: If the path contains wildcards (`*`, `?`, `[...]`), uses minimatch to find matching files
2. **Primary location**: Checks `<extract-dir>/completions/_tool.zsh` (relative to extracted archive)
3. **Fallback location**: Checks relative to config file if not found in extracted archive
4. **No context variables needed**: Path resolution happens automatically during installation

**Example with simple path:**
```typescript
// Your configuration
.zsh((shell) => shell.completions('completions/_tool.zsh'))

// What happens during installation:
// 1. Archive extracted to: /path/to/.generated/binaries/tool/15.1.0/
// 2. System looks for: /path/to/.generated/binaries/tool/15.1.0/completions/_tool.zsh
// 3. File symlinked to: /path/to/.generated/shell/zsh/completions/_tool
```

**Example with glob pattern:**
```typescript
// Your configuration
.zsh((shell) => shell.completions('*/complete/_rg'))

// What happens during installation:
// 1. Archive extracted to: /path/to/.generated/binaries/rg/15.1.0/
// 2. Archive contains: ripgrep-15.1.0-aarch64-apple-darwin/complete/_rg
// 3. System matches: ripgrep-15.1.0-aarch64-apple-darwin/complete/_rg
// 4. File symlinked to: /path/to/.generated/shell/zsh/completions/_rg
```

**Supported glob patterns:**
- `*` - Matches any characters except `/`
- `**` - Matches any characters including `/`
- `?` - Matches a single character
- `[abc]` - Matches any character in the set
- `tool-*/bin` - Matches versioned directories like `tool-1.0.0/bin`

### Target Directory Resolution (Manual)

When you specify `targetDir`, use context variables to create absolute paths:

```typescript
.zsh((shell) => shell.completions({
  source: 'completions/_tool.zsh',           // Automatic - relative to extracted archive
  targetDir: `${ctx.projectConfig.paths.homeDir}/.zsh/completions`  // Manual - absolute path with context
}))
```

**Available context variables for targetDir:**
- `ctx.projectConfig.paths.homeDir` - User's home directory
- `ctx.projectConfig.paths.generatedDir` - Generated files directory
- `ctx.projectConfig.paths.shellScriptsDir` - Shell scripts directory
- `ctx.projectConfig.paths.dotfilesDir` - Dotfiles root directory

If `targetDir` is not specified, completions are installed to the default shell-specific directory in your generated files.

## Troubleshooting

### Completions Not Loading

**Symptom:** You see a warning like `WARN Completion file not found: /path/to/completions/_tool`

**Causes and solutions:**

1. **Wrong path in configuration**: Check that the `source` path matches the actual location in the archive
   ```bash
   # Download and extract the archive manually to inspect its structure
   tar -tzf downloaded-archive.tar.gz | grep completion
   ```
   
   **Tip**: The system logs all files found in the archive when a completion file is not found. Check the warning logs to see what files are available and adjust your glob pattern accordingly.

2. **Glob pattern not matching**: If using wildcards, verify the pattern matches the actual file structure
   ```typescript
   // ❌ Wrong - pattern doesn't match archive structure
   .zsh((shell) => shell.completions('completions/_tool'))
   // Archive has: tool-1.0.0/complete/_tool
   
   // ✅ Correct - pattern matches the archive structure
   .zsh((shell) => shell.completions('*/complete/_tool'))
   ```

2. **Archive doesn't include completions**: Some tools don't ship completion files in their releases
   - Solution: Use `cmd` to generate completions instead
   - Or use `once` scripts to generate completions after installation

3. **Path relative to wrong location**: Remember `source` is relative to the extracted archive root, not your config file
   ```typescript
   // ❌ Wrong - trying to use context variable for source
   .zsh((shell) => shell.completions(`${ctx.toolDir}/completions/_tool`))
   
   // ✅ Correct - path relative to extracted archive
   .zsh((shell) => shell.completions('completions/_tool'))
   
   // ✅ Correct - using glob pattern for versioned directories
   .zsh((shell) => shell.completions('*/completions/_tool'))
   ```

4. **Verify installation**:
   ```bash
   # Check if completion file was symlinked
   ls -la ~/.generated/shell/zsh/completions/_tool
   
   # Check where it points to
   readlink ~/.generated/shell/zsh/completions/_tool
   
   # Test zsh completion loading
   autoload -U compinit && compinit
   ```

### Generated Completions Not Working

1. **Check tool supports completion generation**: Not all tools provide completion generation
2. **Verify command syntax**: Test the completion generation command manually
3. **Check permissions**: Ensure the generated file is readable

```typescript
.zsh((shell) =>
  shell.once(/* zsh */`
    # Add error checking for completion generation
    if command -v tool >/dev/null 2>&1; then
      if tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool" 2>/dev/null; then
        echo "Generated completions for tool"
      else
        echo "Failed to generate completions for tool"
      fi
    fi
  `)
);
```

## Best Practices

1. **Provide completions when available**: Most modern CLI tools include completion files
2. **Use standard locations**: Let the system handle completion directory selection
3. **Test across shells**: Ensure completions work in your target shells
4. **Handle generation gracefully**: Add error checking for generated completions
5. **Use appropriate naming**: Follow shell-specific naming conventions

## Integration with Shell Configuration

Completions work seamlessly with other shell integration features:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/my-tool' })
    .bin('my-tool')
    .zsh((shell) =>
      shell
        .completions('completions/_my-tool')
        .aliases({
          mt: 'my-tool'
        })
        .environment({
          MY_TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/my-tool`
        })
    )
    .bash((shell) =>
      shell
        .completions('completions/my-tool.bash')
        .aliases({
          mt: 'my-tool'
        })
    )
);
```

## CLI Completions

The `dotfiles` CLI automatically generates its own shell completions when you run `dotfiles generate`. These completions provide tab-completion for all CLI commands, subcommands, and options.

### Generated Location

CLI completions are generated to:
```
<generatedDir>/shell-scripts/zsh/completions/_dotfiles
```

### Automatic Updates

CLI completions are regenerated automatically whenever you run `dotfiles generate`. This ensures completions stay in sync with the CLI's available commands and options.

### Tool Name Suggestions

Commands that accept a tool name (like `install`, `update`, `check-updates`, `files`, and `log`) include the names of every configured tool in their completions. The list is rebuilt each time `dotfiles generate` runs, so it always reflects the current registry.

### Usage

After running `dotfiles generate`, start a new shell session or reload your completions:

```bash
# Reload zsh completions
autoload -U compinit && compinit
```

Then use tab completion with the `dotfiles` command:

```bash
dotfiles <TAB>           # Shows available commands
dotfiles install <TAB>   # Shows install command options
dotfiles --<TAB>         # Shows global options
```

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments and aliases
- [Symbolic Links](./symlinks.md) - Link configuration files
- [Common Patterns](./common-patterns.md) - See real-world examples