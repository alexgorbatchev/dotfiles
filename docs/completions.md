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
  name?: string,       // Optional custom name for installed completion file
  targetDir?: string   // Optional custom installation directory (absolute path)
}
```

**Note**: Either `source` OR `cmd` must be provided, but not both.

## Parameters

- **`source`**: Path to completion file **relative to the extracted tool archive root**
  - Example: `'completions/_tool.zsh'` looks for `completions/_tool.zsh` inside the extracted archive
  - Example: `'shell/completion.zsh'` looks for `shell/completion.zsh` inside the extracted archive
- **`cmd`**: Command to execute to generate completion content dynamically
  - Example: `'my-tool completion zsh'` executes the tool's completion command
  - Example: `'kubectl completion bash'` generates Kubernetes completions
  - The command is executed in the tool's installation directory
- **`name`**: Optional custom name for the installed completion file (defaults to shell-specific naming)
- **`targetDir`**: Optional custom installation directory **absolute path** (defaults to shell-specific completion directory)

## Completion Methods

### Static Completions (source)

Use `source` when completion files are included in the tool's archive:

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'));
```

### Dynamic Completions (cmd)

Use `cmd` when the tool can generate completions dynamically:

```typescript
.zsh((shell) => shell.completions({ cmd: 'my-tool completion zsh' }));
```

## Basic Examples

### Command-Generated Completions

```typescript
.zsh((shell) => shell.completions({ cmd: 'kubectl completion zsh' }))
.bash((shell) => shell.completions({ cmd: 'kubectl completion bash' }))
.powershell((shell) => shell.completions({ cmd: 'kubectl completion powershell' }));
```

### Static File Completions

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'));
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

### Custom Installation Directory

```typescript
.zsh((shell) => shell.completions({
  source: 'completions/tool.zsh',
  targetDir: `${ctx.homeDir}/.zsh/completions`
}));
```

## Generated Completions

Some tools can generate their own completions. Use shell initialization scripts for this:

```typescript
.zsh((shell) =>
  shell.once(/* zsh */`
    # Generate completions once after installation
    if command -v tool >/dev/null 2>&1; then
      tool completion zsh > "${ctx.generatedDir}/completions/_tool"
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

- **Source paths** are relative to the extracted tool archive root
- **Target directories** must be absolute paths using context variables
- Completion files are automatically copied to the appropriate shell completion directories

## Troubleshooting

### Completions Not Loading

1. **Check file exists**: Verify the completion file exists in the extracted archive
2. **Check path**: Ensure the source path is correct relative to archive root
3. **Test manually**: Try loading the completion file directly
4. **Check shell setup**: Ensure completion loading is configured in your shell

```bash
# Check if completion file was installed
ls -la ${ctx.generatedDir}/completions/_tool

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
      if tool completion zsh > "${ctx.generatedDir}/completions/_tool" 2>/dev/null; then
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
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  .bin('my-tool')
   .install('github-release', { repo: 'owner/my-tool' })
   .zsh((shell) =>
     shell
       .completions('completions/_my-tool')
       .aliases({
         mt: 'my-tool'
       })
       .environment({
         MY_TOOL_CONFIG: `${ctx.homeDir}/.config/my-tool`
       })
   )
   .bash((shell) =>
     shell
       .completions('completions/my-tool.bash')
       .aliases({
         mt: 'my-tool'
       })
   );
};
```

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments and aliases
- [Symbolic Links](./symlinks.md) - Link configuration files
- [Common Patterns](./common-patterns.md) - See real-world examples