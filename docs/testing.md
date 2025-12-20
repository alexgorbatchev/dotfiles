# Testing and Validation

This section covers how to test and validate your `.tool.ts` configurations to ensure they work correctly.

## Compile-Time Validation

### TypeScript Type Checking

Run TypeScript compiler to check for type errors:

```bash
# Check types and lint code
npm run lint

# Type checking only
npm run typecheck

# Compile the project
npm run build
```

### Common Type Issues

- Missing required parameters in installation methods
- Invalid platform or architecture values
- Incorrect import statements
- Wrong function signatures

## Runtime Testing

### Tool Installation Testing

Test individual tool installations:

```bash
# Install a specific tool
dotfiles install tool-name

# Install with verbose output
DEBUG=1 dotfiles install tool-name

# Force reinstall (useful for testing)
dotfiles install tool-name --force
```

### Configuration Generation

Test configuration generation:

```bash
# Generate all configurations
dotfiles generate

# Generate for specific tool
dotfiles generate --tool tool-name

# Check what files would be generated
dotfiles files tool-name
```

### Update Checking

Test version checking and updates:

```bash
# Check for updates
dotfiles check-updates tool-name

# Update specific tool
dotfiles update tool-name

# Update all tools
dotfiles update
```

## Validation Steps

### 1. TypeScript Compilation

Ensure no type errors in your configuration:

```bash
npm run typecheck
```

**Common issues:**
- Missing imports
- Invalid method parameters
- Incorrect function signature

### 2. Installation Test

Verify the tool installs correctly:

```bash
dotfiles install your-tool
```

**Check for:**
- Successful download and extraction
- Binary placement in correct location
- No installation errors

### 3. Binary Access

Check that shims work and binaries are accessible:

```bash
# Check if shim was created
ls -la ${ctx.projectConfig.paths.generatedDir}/usr-local-bin/your-tool

# Test binary execution
your-tool --version

# Check PATH includes bin directory
echo $PATH | grep -o ${ctx.projectConfig.paths.generatedDir}/usr-local-bin
```

### 4. Shell Integration

Test aliases, functions, and environment variables:

```bash
# Source shell scripts manually
source ${ctx.projectConfig.paths.generatedDir}/shell-scripts/main.zsh

# Test aliases
alias | grep your-tool

# Test environment variables
env | grep YOUR_TOOL

# Test functions
type your-tool-helper
```

### 5. Platform Compatibility

Test on target platforms when using platform-specific configurations:

```bash
# Test on different platforms
# - macOS: Test Homebrew installations
# - Linux: Test GitHub release installations  
# - Windows: Test PowerShell configurations
```

## Testing Strategies

### Local Testing

#### 1. Clean Environment Testing

Test in a clean environment to avoid conflicts:

```bash
# Create test directory
mkdir /tmp/dotfiles-test
cd /tmp/dotfiles-test

# Clone and test
git clone your-dotfiles-repo .
dotfiles install your-tool
```

#### 2. Incremental Testing

Test individual components:

```bash
# Test just the installation
dotfiles install your-tool

# Test just the generation
dotfiles generate --tool your-tool

# Test just the shell integration
source ${ctx.projectConfig.paths.generatedDir}/shell-scripts/main.zsh
```

### Automated Testing

#### 1. Configuration Validation

Create tests for your configurations:

```typescript
// test-tool-config.ts
import { describe, it, expect } from 'bun:test';
import { defineTool } from '@gitea/dotfiles';

describe('Your Tool Configuration', () => {
  it('should have valid configuration', async () => {
    const mockContext = {
      toolName: 'your-tool',
      projectConfig: { paths: { binariesDir: '/tools', homeDir: '/home/test' } },
      // ... other context properties
    };
    
    // Test that configuration doesn't throw
    const tool = defineTool((install, ctx) =>
      install('github-release', { repo: 'owner/your-tool' })
        .bin('your-tool')
    );
    
    expect(tool).toBeDefined();
  });
});
```

#### 2. Integration Testing

Test the complete installation flow:

```bash
#!/bin/bash
# test-installation.sh

set -e

echo "Testing tool installation..."

# Install tool
dotfiles install your-tool

# Verify binary exists
if ! command -v your-tool &> /dev/null; then
    echo "ERROR: Tool binary not found"
    exit 1
fi

# Test basic functionality
your-tool --version

echo "Installation test passed!"
```

## Debugging Tools

### Enable Debug Logging

```bash
# Enable debug output
export DEBUG=1
dotfiles install your-tool

# Or inline
DEBUG=1 dotfiles install your-tool
```

### Check Generated Files

Inspect generated files to verify correctness:

```bash
# View generated shell scripts
cat ${ctx.projectConfig.paths.generatedDir}/shell-scripts/main.zsh

# Check shim contents  
cat ${ctx.projectConfig.paths.generatedDir}/usr-local-bin/your-tool

# View tool installation directory
ls -la ${ctx.projectConfig.paths.generatedDir}/binaries/your-tool/
```

### Validate Configuration Syntax

```bash
# Check configuration files
dotfiles files your-tool

# Validate specific operations
dotfiles generate --tool your-tool --dry-run
```

## Common Testing Scenarios

### 1. GitHub Release Tool

```bash
# Test GitHub release installation
dotfiles install your-github-tool

# Verify correct asset was downloaded
ls -la ${ctx.projectConfig.paths.generatedDir}/binaries/your-github-tool/

# Test binary works
your-github-tool --version
```

### 2. Homebrew Tool

```bash
# Test Homebrew installation (macOS/Linux)
dotfiles install your-brew-tool

# Verify Homebrew was used
brew list | grep your-brew-tool

# Test shim points to Homebrew binary
readlink ${ctx.projectConfig.paths.generatedDir}/usr-local-bin/your-brew-tool
```

### 3. Cross-Platform Tool

```bash
# Test platform detection
DEBUG=1 dotfiles install cross-platform-tool

# Verify correct platform configuration was used
# Check logs for platform-specific installation method
```

### 4. Tool with Hooks

```bash
# Test hook execution
DEBUG=1 dotfiles install tool-with-hooks

# Verify hook effects
# - Check created directories
# - Verify generated files
# - Test custom setup
```

## Troubleshooting Test Failures

### Installation Failures

1. **Check asset patterns**: Verify GitHub release asset patterns match actual releases
2. **Verify repository names**: Ensure repository URLs are correct
3. **Check platform detection**: Verify platform-specific configurations are correct

### Binary Access Issues

1. **Check PATH**: Ensure generated bin directory is in PATH
2. **Verify shims**: Check that shims were created and are executable
3. **Test permissions**: Ensure binaries have execute permissions

### Shell Integration Problems

1. **Source shell scripts**: Manually source generated shell scripts
2. **Check syntax**: Verify shell script syntax is correct
3. **Test aliases**: Ensure aliases are defined correctly

## Best Practices

### 1. Test Early and Often

- Test configurations as you develop them
- Use incremental testing to isolate issues
- Test on clean environments regularly

### 2. Use Version Control

- Commit working configurations
- Use branches for experimental changes
- Tag stable configurations

### 3. Document Test Procedures

- Document platform-specific testing steps
- Create test scripts for complex configurations
- Maintain testing checklists

### 4. Automate Where Possible

- Use CI/CD for automated testing
- Create test suites for common scenarios
- Automate platform compatibility testing

### 5. Test Edge Cases

- Test with different versions
- Test platform-specific edge cases
- Test error conditions and recovery

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test Tool Configurations

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
    
    - name: Type check
      run: npm run typecheck
    
    - name: Test tool installation
      run: |
        dotfiles install test-tool
        test-tool --version
```

## Next Steps

- [Troubleshooting](./troubleshooting.md) - Debug common issues
- [Common Patterns](./common-patterns.md) - See tested examples
- [TypeScript Requirements](./typescript.md) - Understand type validation