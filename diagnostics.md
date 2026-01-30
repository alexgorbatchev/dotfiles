# Diagnostics Guide

## Testing for Completion Generation Infinite Loops

### Problem Description

An infinite loop can occur during shell initialization when:

1. A tool is marked as "installed" in the registry
2. The actual binary file is missing
3. Shell init scripts run completion commands (e.g., `fnm completions --shell zsh`)
4. The completion command falls back to the shim
5. The shim triggers installation
6. Installation thinks tool is already installed (from registry)
7. Completion generation runs again → loop repeats

### How to Reproduce

#### Setup

```bash
# Generate all files including shims and shell init
bun cli --config=test-project/config.ts generate

# Install a tool that has completion commands (e.g., fnm)
bun cli --config=test-project/config.ts install curl-script--fnm

# Verify binary exists
ls -la test-project/.generated/binaries/curl-script--fnm/current/fnm
```

#### Trigger the Issue

```bash
# Delete the binary but keep the registry entry
rm -f test-project/.generated/binaries/curl-script--fnm/*/fnm

# Source main.zsh with a short timeout to detect infinite loop
timeout 5 zsh -c 'source test-project/.generated/shell-scripts/main.zsh' 2>&1

# If timeout kills the process (exit code 143), infinite loop is present
echo $?  # 143 = SIGTERM from timeout
```

### Root Cause

The [`CompletionCommandExecutor`](packages/shell-init-generator/src/completion-generator/CompletionCommandExecutor.ts) was running completion commands with:

```bash
PATH=${workingDir}:$PATH fnm completions --shell zsh
```

When the binary didn't exist in `workingDir`, the command fell back to the shim in `$PATH`, which triggered installation, which triggered completion generation again.

### The Fix

1. **Binary Path Validation**: `CompletionCommandExecutor` now accepts `binaryPaths` parameter containing actual installed binary locations
2. **Fail Fast**: Before running completion command, validates that at least one binary exists using `command -v` with restricted PATH
3. **Clear Error**: Fails with descriptive message listing searched locations instead of falling back to shim
4. **Already-Installed Case**: `Installer` now computes and returns `binaryPaths` even for "already-installed" results

### Test Strategy

#### Unit Tests

Create tests that verify binary validation:

```typescript
test('should fail fast when binary does not exist', async () => {
  const workingDir = path.join(tempDir, 'fnm-current');
  fs.mkdirSync(workingDir, { recursive: true });

  const executor = new CompletionCommandExecutor(logger, shell);

  await expect(
    executor.executeCompletionCommand(
      'fnm completions --shell zsh',
      'fnm',
      'zsh',
      workingDir,
      [path.join(workingDir, 'fnm')], // Binary doesn't exist
    ),
  ).rejects.toThrow(/None of the expected binaries.*found in/);
});
```

#### Integration Tests

Test the full flow:

```bash
# 1. Clean state
rm -rf test-project/.generated

# 2. Generate infrastructure
bun cli --config=test-project/config.ts generate

# 3. Verify sourcing main.zsh triggers tool installation
timeout 10 zsh -c 'source test-project/.generated/shell-scripts/main.zsh'

# 4. Verify tool was installed
test -f test-project/.generated/binaries/curl-script--fnm/current/fnm
echo "Binary installed: $?"

# 5. Test broken scenario - delete binary
rm -f test-project/.generated/binaries/curl-script--fnm/*/fnm

# 6. Source again - should NOT infinite loop
timeout 5 zsh -c 'source test-project/.generated/shell-scripts/main.zsh' 2>&1
exit_code=$?

# Exit code 143 = timeout killed process = infinite loop detected
# Exit code 0 or 1 = no infinite loop (expected behavior)
if [ $exit_code -eq 143 ]; then
  echo "FAIL: Infinite loop detected"
  exit 1
else
  echo "PASS: No infinite loop"
  exit 0
fi
```

### Verification Checklist

- [ ] Unit tests pass for binary validation
- [ ] Integration test completes within timeout
- [ ] Completion generation fails fast with clear error when binary missing
- [ ] No infinite loop when sourcing main.zsh with missing binary
- [ ] Already-installed tools return `binaryPaths` in result
- [ ] Full test suite passes (`bun test`)
- [ ] Type checking passes (`bun typecheck`)

### Related Files

- [`packages/shell-init-generator/src/completion-generator/CompletionCommandExecutor.ts`](packages/shell-init-generator/src/completion-generator/CompletionCommandExecutor.ts)
- [`packages/shell-init-generator/src/completion-generator/__tests__/CompletionCommandExecutor--binary-paths.test.ts`](packages/shell-init-generator/src/completion-generator/__tests__/CompletionCommandExecutor--binary-paths.test.ts)
- [`packages/installer/src/Installer.ts`](packages/installer/src/Installer.ts)
- [`packages/generator-orchestrator/src/GeneratorOrchestrator.ts`](packages/generator-orchestrator/src/GeneratorOrchestrator.ts)
- [`packages/cli/src/installCommand.ts`](packages/cli/src/installCommand.ts)

### Edge Cases to Test

1. **Multiple binaries**: Tool with multiple binaries (e.g., ripgrep has `rg` and `rg-prebuilt`)
2. **No binaryPaths**: Backward compatibility when `binaryPaths` is undefined
3. **Empty binaryPaths**: When binaryPaths array is empty
4. **System-wide install**: Binary exists in system PATH but not in project binaries dir
5. **Symlink resolution**: Binary path is a symlink to actual binary

### Performance Considerations

The binary existence check uses `command -v` with restricted PATH, which is fast:

```bash
PATH=/custom/path command -v binary_name
```

This avoids expensive file system scanning while ensuring we only find binaries in expected locations.
