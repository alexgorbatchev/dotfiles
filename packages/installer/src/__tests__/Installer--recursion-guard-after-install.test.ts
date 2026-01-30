import type { IAfterInstallContext } from '@dotfiles/core';
import type { ManualToolConfig } from '@dotfiles/installer-manual';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createInstallerTestSetup, createManualToolConfig, type IInstallerTestSetup } from './installer-test-helpers';

/**
 * Tests that the recursion guard environment variable is set in the shell environment
 * during after-install hook execution.
 *
 * BUG: When a .tool.ts file's after-install hook calls a shimmed binary
 * (e.g., `bat --version` to generate completions), it falls into an infinite loop.
 *
 * ROOT CAUSE: The shell environment didn't include the recursion guard env var.
 * This means:
 * 1. After-install hook runs a command like `bat --version`
 * 2. If the shim is in PATH, it gets invoked
 * 3. Shim checks for DOTFILES_INSTALLING_BAT - but it's NOT SET!
 * 4. Shim tries to install the tool → infinite loop
 *
 * The fix: Configure the shell with the recursion guard env var so all spawned
 * processes inherit it. We avoid modifying process.env directly.
 */
describe('Installer - Recursion Guard During After-Install Hook', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should have recursion guard env var set in shell during after-install hook execution', async () => {
    const toolName = 'my-test-tool';
    const envVarName = 'DOTFILES_INSTALLING_MY_TEST_TOOL';

    let envVarSeenByShell: string | undefined;

    const afterInstallHook = mock(async (context: IAfterInstallContext) => {
      // Check the shell environment - this is what matters for shim detection.
      // We use printenv to verify the shell process has the env var set.
      const result = await context.$`printenv ${envVarName} || true`.quiet();
      envVarSeenByShell = result.stdout.trim() || undefined;
    });

    const toolConfig: ManualToolConfig = createManualToolConfig({
      name: toolName,
      binaries: [toolName],
      installParams: {
        hooks: {
          'after-install': [afterInstallHook],
        },
      },
    });

    await setup.installer.install(toolName, toolConfig);

    // The hook must have been called
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    // CRITICAL: The recursion guard env var must be visible to shell commands.
    // This is what prevents the shim from triggering re-installation.
    expect(envVarSeenByShell).toBe('true');

    // We no longer modify process.env, so no cleanup assertion needed.
    // The env var is scoped to the shell environment passed to hooks.
  });

  it('should have recursion guard env var set during shell command in after-install hook', async () => {
    const toolName = 'shell-test-tool';
    const envVarName = 'DOTFILES_INSTALLING_SHELL_TEST_TOOL';

    let envVarSeenByShell: string | undefined;

    const afterInstallHook = mock(async (context: IAfterInstallContext) => {
      // When a hook executes a shell command, that command should also see the
      // recursion guard env var. This is critical because shimmed binaries
      // inherit the shell's environment and check for this variable.
      const result = await context.$`printenv ${envVarName} || true`.quiet();
      envVarSeenByShell = result.stdout.trim() || undefined;
    });

    const toolConfig: ManualToolConfig = createManualToolConfig({
      name: toolName,
      binaries: [toolName],
      installParams: {
        hooks: {
          'after-install': [afterInstallHook],
        },
      },
    });

    await setup.installer.install(toolName, toolConfig);

    // The hook must have been called
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    // CRITICAL: Shell commands in after-install hooks must inherit the recursion guard.
    // This prevents infinite loops when running commands like `tool --generate-completions`
    // that might resolve to a shim.
    expect(envVarSeenByShell).toBe('true');

    // We no longer modify process.env, so no cleanup assertion needed.
  });

  it('should have recursion guard visible to shell even if after-install hook throws', async () => {
    const toolName = 'failing-hook-tool';
    const envVarName = 'DOTFILES_INSTALLING_FAILING_HOOK_TOOL';

    let envVarSeenByShell: string | undefined;

    const afterInstallHook = mock(async (context: IAfterInstallContext) => {
      // Capture the env var via shell before throwing
      const result = await context.$`printenv ${envVarName} || true`.quiet();
      envVarSeenByShell = result.stdout.trim() || undefined;
      throw new Error('Hook failed intentionally');
    });

    const toolConfig: ManualToolConfig = createManualToolConfig({
      name: toolName,
      binaries: [toolName],
      installParams: {
        hooks: {
          'after-install': [afterInstallHook],
        },
      },
    });

    // Installation should still succeed (after-install hooks have continueOnError: true)
    const result = await setup.installer.install(toolName, toolConfig);
    expect(result.success).toBe(true);

    // The hook was called
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    // The env var must have been visible to shell during hook execution
    expect(envVarSeenByShell).toBe('true');

    // We no longer modify process.env, so no cleanup assertion needed.
  });
});
