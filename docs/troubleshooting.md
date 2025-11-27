# Troubleshooting

Common issues and solutions when working with `.tool.ts` configurations.

## Installation Issues

### Tool not found after installation

**Symptoms:**
- Command not found errors
- Shims not working

**Solutions:**
- Check that `.bin()` is called with correct binary names
- Verify shims are generated in the bin directory
- Ensure PATH includes the generated bin directory
- Check binary permissions

```bash
# Check if shim exists
ls -la ${ctx.binDir}/tool-name

# Check PATH includes bin directory
echo $PATH | grep -o ${ctx.binDir}

# Test shim directly
${ctx.binDir}/tool-name --version
```

### Installation fails

**Symptoms:**
- Download errors
- Extraction failures
- Asset not found

**Solutions:**
- Check asset patterns for GitHub releases
- Verify repository names and URLs
- Review installation logs for specific errors
- Test asset selector logic

```typescript
// Debug asset selection
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: (context) => {
      const { assets, systemInfo, logger } = context;
      logger.debug('Available assets:', assets.map(a => a.name).join(', '));
      logger.debug('System info:', systemInfo);
      // Your selection logic here
      return assets[0];
    }
  })
    .bin('tool')
);
```

### Infinite Recursion / Loop

**Symptoms:**
- Installation hangs indefinitely
- Logs show repeated execution of the same tool
- Error message: "Recursive installation detected for [TOOL]. Aborting to prevent infinite loop."

**Causes:**
- A tool's shim is calling itself (e.g., `curl` shim calling `curl` during installation)
- A script uses a tool that is currently being installed, and the shim intercepts the call

**Solutions:**
- The installer now includes automatic recursion guards (`DOTFILES_INSTALLING_<TOOL>`) to prevent this.
- If you see the recursion error, it means the guard is working. Check your installation scripts to ensure they aren't inadvertently calling the tool being installed via its shim.
- Ensure that `PATH` is correctly set up so that the installer can find the real binary (the installer automatically prepends the installation directory to `PATH`).

### Dependency errors

**Symptoms:**
- CLI exits with messages like "Missing dependency", "Ambiguous dependency", or "Circular dependency detected"
- Tool installations succeed individually but `dotfiles generate` fails when processing dependents

**Solutions:**
- Ensure every `.dependsOn()` call references a binary that is exposed via `.bin()` in exactly one tool
- Rename binaries or adjust dependencies when more than one tool provides the same name
- Break dependency loops by removing or refactoring circular references
- Verify that providers include the active platform/architecture when using platform-specific configuration
- Run `bun test packages/e2e-test/src/__tests__/dependency-ordering.e2e.test.ts` to reproduce ordering scenarios locally

```bash
# Example error output and next steps
dotfiles generate --config path/to/config.yaml
# Missing dependency: tool "consumer" requires binary "shared-runtime" (platform linux/x86_64)
# -> Add .dependsOn('shared-runtime') to the provider or install a system package that supplies it
```

## Shell Integration Issues

### Shell integration not working

**Symptoms:**
- Aliases not available
- Environment variables not set
- Functions not defined

**Solutions:**
- Ensure shell scripts are properly sourced
- Check for syntax errors in shell code
- Verify environment variables are set correctly
- Test shell script generation

```bash
# Check generated shell scripts
cat ${ctx.shellScriptsDir}/main.zsh

# Test shell script syntax
zsh -n ${ctx.shellScriptsDir}/main.zsh

# Source manually to test
source ${ctx.shellScriptsDir}/main.zsh
```

### Environment variables not available

**Symptoms:**
- Variables undefined in shell
- Inconsistent behavior across shells

**Solutions:**
- Use declarative environment configuration
- Check variable names and values
- Verify shell script generation

```typescript
// ✅ Correct declarative approach
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_HOME: `${ctx.toolDir}`,
        TOOL_CONFIG: `${ctx.homeDir}/.config/tool`
      })
    )
);

// ❌ Avoid inline exports for simple variables
// Instead of:
// c.zsh((shell) =>
//   shell.always(`
//     export TOOL_HOME="${ctx.toolDir}"  # Use declarative instead
//   `)
// )
```

## Platform-Specific Issues

### Platform detection problems

**Symptoms:**
- Wrong assets downloaded
- Platform-specific code not executing

**Solutions:**
- Check platform detection logic
- Verify asset patterns work for all target platforms
- Test on actual target platforms when possible
- Use custom asset selectors for complex cases

```typescript
// Debug platform detection (assetSelector doesn't have logger access)
c.install('github-release', {
  repo: 'owner/tool',
  assetSelector: (assets, sysInfo) => {
    // Note: Use console.log here since logger is not available in assetSelector
    console.log('Detected platform:', sysInfo.platform);
    console.log('Detected architecture:', sysInfo.arch);
    // Platform-specific logic
  }
})
```

### Cross-platform path issues

**Symptoms:**
- Paths not working on Windows
- Backslash/forward slash conflicts

**Solutions:**
- Use context variables consistently
- Avoid hardcoded path separators
- Test on target platforms

```typescript
// ✅ Correct cross-platform paths
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.toml', path.join(ctx.homeDir, '.config', 'tool', 'config.toml'))
);

// ❌ Platform-specific paths
// Don't do:
// c.symlink('./config.toml', `${ctx.homeDir}\\.config\\tool\\config.toml`)  // Windows only
// c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)  // Unix only
```

## Completion Issues

### Completions not loading

**Symptoms:**
- Tab completion not working
- Completion files not found

**Solutions:**
- Verify completion file paths in extracted archives
- Check that completion directories exist
- Ensure shell completion loading is properly configured

```bash
# Check completion file exists
ls -la ${ctx.generatedDir}/completions/_tool

# Test completion loading manually
autoload -U compinit && compinit
source ${ctx.generatedDir}/completions/_tool
```

### Completion generation fails

**Symptoms:**
- Once scripts failing
- Generated completions empty

**Solutions:**
- Check tool supports completion generation
- Verify command syntax
- Test completion generation manually

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.once(`
        # Add error checking
        if command -v tool >/dev/null 2>&1; then
          tool completion zsh > "${ctx.generatedDir}/completions/_tool" || echo "Completion generation failed"
        fi
      `)
    )
);
```

## Path Resolution Issues

### Relative paths not working

**Symptoms:**
- Files not found
- Symlinks pointing to wrong locations

**Solutions:**
- Use context variables for all paths
- Understand path resolution rules
- Check file locations

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

// ✅ Correct path usage
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.toml', path.join(ctx.homeDir, '.config', 'tool', 'config.toml'))
);

// ❌ Incorrect hardcoded paths
// Don't do:
// c.symlink('./config.toml', '~/.config/tool/config.toml')
// c.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```

## Hook Issues

### Hooks not executing

**Symptoms:**
- Post-install setup not running
- Hook errors not visible

**Solutions:**
- Check hook syntax and logic
- Add error handling and logging
- Test hooks in isolation

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ logger, $ }) => {
      try {
        logger.info('Starting post-install setup...');
        await $`./setup.sh`;
        logger.info('Post-install setup completed');
      } catch (error) {
        logger.error(`Setup failed`);
        throw error; // Re-throw to fail the installation
      }
    })
);
```

### Shell executor (`$`) issues

**Symptoms:**
- Commands not finding files
- Working directory problems

**Solutions:**
- Remember `$` uses tool directory as cwd
- Use absolute paths when needed
- Handle cross-platform commands

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, logger, systemInfo }) => {
      // Check current directory
      const pwd = await $`pwd`;
      logger.info(`Working directory: ${pwd.stdout.trim()}`);
      
      // Cross-platform commands
      if (systemInfo.platform === 'win32') {
        await $`dir .`;
      } else {
        await $`ls -la ./`;
      }
    })
);
```

## Debugging Tools

### Check generated files

```bash
# View generated shell scripts
cat ${ctx.generatedDir}/shell-scripts/main.zsh

# Check shim contents  
cat ${ctx.generatedDir}/bin/tool-name

# View tool installation directory
ls -la ${ctx.toolDir}/
```

### Enable debug logging

```bash
# Set debug environment variable
export DEBUG=1
dotfiles install tool-name
```

### Validate configuration

```bash
# Check configuration syntax
dotfiles files tool-name

# Test specific operations
dotfiles generate --tool tool-name
```

### Test installation steps

```bash
# Install specific tool
dotfiles install tool-name

# Generate configurations
dotfiles generate

# Check for updates
dotfiles check-updates tool-name
```

## Performance Issues

### Slow shell startup

**Symptoms:**
- Shell takes long to start
- Noticeable delay in prompt

**Solutions:**
- Use `once` scripts for expensive operations
- Keep `always` scripts lightweight
- Profile shell startup

```typescript
// ✅ Optimize with once scripts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(`
          # Expensive operations run only once
          tool build-cache
          tool gen-completions zsh > "${ctx.generatedDir}/completions/_tool"
        `)
        .always(`
          # Fast operations only
          function quick-helper() {
            tool "$@"
          }
        `)
    )
);
```

## Security Issues

### Untrusted scripts

**Symptoms:**
- Security warnings
- Curl script concerns

**Solutions:**
- Verify script sources
- Use GitHub releases when possible
- Review script contents

```typescript
// ✅ Prefer GitHub releases
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'trusted/tool' })
    .bin('tool')
);

// ⚠️ Use curl scripts carefully
// export default defineTool((install, ctx) =>
//   install('curl-script', {
//     url: 'https://trusted-source.com/install.sh',  // Verify source
//     shell: 'bash'
//   })
//     .bin('tool')
// );
```

## Shell Executor (`$`) Issues

### Common `$` Problems and Solutions

**Problem: Commands not finding files relative to tool config**
```
Error: ./config.toml: No such file or directory
```
**Solution:** Ensure you're using `$` (not `fileSystem` methods) for shell commands that need to access files relative to your `.tool.ts` file:
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, fileSystem }) => {
      // ❌ Wrong - fileSystem doesn't use tool directory as cwd
      // await fileSystem.readFile('./config.toml');

      // ✅ Correct - $ automatically uses tool directory as cwd
      const result = await $`cat ./config.toml`;
    })
);
```

**Problem: Working directory not what you expected**
```
Error: Commands running in wrong directory
```
**Solution:** Remember that `$` automatically sets `cwd` to your `.tool.ts` file's directory:
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ logger, $, installDir }) => {
      const pwd = await $`pwd`;
      logger.warn('Working directory:', pwd.stdout.trim());
      
      // Use absolute paths if you need to work elsewhere
      await $`cd ${installDir} && ./binary --version`;
    })
);
```

**Problem: Shell commands failing on Windows**
```
Error: 'ls' is not recognized as an internal or external command
```
**Solution:** Use cross-platform commands or detect platform:
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ systemInfo, $ }) => {
      // ❌ Unix-specific command
      // await $`ls -la ./`;

      // ✅ Cross-platform approach
      if (systemInfo.platform === 'win32') {
        await $`dir .`;
      } else {
        await $`ls -la ./`;
      }
    })
);
```

**Problem: Command output not captured correctly**
```
Error: Cannot read property 'stdout' of undefined
```
**Solution:** Always await `$` commands and handle errors:
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $ }) => {
      // ❌ Missing await
      // const result = $`tool --version`;

      // ✅ Proper async/await with error handling
      try {
        const result = await $`tool --version`;
        const version = result.stdout.trim();
      } catch (error) {
        // Handle error
      }
    })
);
```

**Problem: Environment variables not available in `$` commands**
```
Error: Environment variable not found
```
**Solution:** Pass environment variables explicitly or use systemInfo:
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, fileSystem, systemInfo }) => {
      // Using systemInfo for common paths
      await $`cp ./config ${systemInfo.homeDir}/.config/tool/`;

      // Setting environment variables for the command
      await $`CUSTOM_VAR=value ./script.sh`;
    })
);
```

### Shell Executor Best Practices

- ✅ Use `$` for shell operations that need tool-relative paths
- ✅ Use `fileSystem` for cross-platform file operations
- ✅ Always handle errors with try/catch blocks
- ✅ Test hooks on multiple platforms
- ✅ Use structured logging with `logger` instead of `console.log()`:
  - `logger.info()` for general information
  - `logger.warn()` for debugging and troubleshooting
  - `logger.error()` for error conditions
- ✅ Prefer absolute paths when working outside tool directory

## Performance Considerations

- Keep shell initialization code efficient
- Avoid heavy operations in shell init scripts
- Use lazy loading for expensive setup
- Cache frequently-used computations
- Use `once` scripts for expensive operations that only need to run after installation

## Security Best Practices

- Never include secrets or API keys in configuration files
- Validate all external inputs in hooks
- Use secure methods for downloading and executing scripts
- Be cautious with file permissions in hooks
- Only use trusted sources for curl scripts
- Review script contents when possible

## Getting Help

1. **Check the logs**: Look for specific error messages
2. **Test components individually**: Isolate the problem
3. **Verify file permissions**: Ensure files are accessible
4. **Test on clean environment**: Rule out conflicts
5. **Check documentation**: Review relevant sections
6. **Create minimal reproduction**: Simplify the configuration

## Next Steps

- [Testing](./testing.md) - Validation and testing approaches
- [Migration Guide](./migration.md) - Converting existing configurations
- [Common Patterns](./common-patterns.md) - Working examples