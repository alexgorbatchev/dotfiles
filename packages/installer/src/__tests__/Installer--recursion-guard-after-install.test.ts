import type { IAfterInstallContext } from '@dotfiles/core';
import type { ManualToolConfig } from '@dotfiles/installer-manual';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createInstallerTestSetup, createManualToolConfig, type IInstallerTestSetup } from './installer-test-helpers';

/**
 * Tests that the recursion guard environment variable is still set during
 * after-install hook execution.
 *
 * BUG: When a .tool.ts file's after-install hook calls a shimmed binary
 * (e.g., `bat --version` to generate completions), it falls into an infinite loop.
 *
 * ROOT CAUSE: The installer's finally block (which cleans up the recursion guard
 * env var DOTFILES_INSTALLING_<TOOL>) runs BEFORE the after-install hook executes.
 * This means:
 * 1. After-install hook runs a command like `bat --version`
 * 2. If the shim is in PATH, it gets invoked
 * 3. Shim checks for DOTFILES_INSTALLING_BAT - but it's NOT SET (already deleted!)
 * 4. Shim tries to install the tool → infinite loop
 *
 * The fix: Keep the recursion guard env var set until AFTER the after-install hook completes.
 */
describe('Installer - Recursion Guard During After-Install Hook', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should have recursion guard env var set during after-install hook execution', async () => {
    const toolName = 'my-test-tool';
    const envVarName = 'DOTFILES_INSTALLING_MY_TEST_TOOL';

    let envVarDuringAfterInstallHook: string | undefined;

    const afterInstallHook = mock(async (_context: IAfterInstallContext) => {
      // Capture the recursion guard env var state during hook execution
      // This env var MUST be set to prevent infinite loops when the hook
      // calls a shimmed binary (e.g., `tool --generate-completions`)
      envVarDuringAfterInstallHook = process.env[envVarName];
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

    // CRITICAL: The recursion guard env var must be set during after-install hook.
    // If this is undefined, the shim will not detect recursion and will try to
    // re-install the tool, causing an infinite loop.
    expect(envVarDuringAfterInstallHook).toBe('true');

    // After installation completes, the env var should be cleaned up
    expect(process.env[envVarName]).toBeUndefined();
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

    // After installation completes, the env var should be cleaned up
    expect(process.env[envVarName]).toBeUndefined();
  });

  it('should clean up recursion guard env var even if after-install hook throws', async () => {
    const toolName = 'failing-hook-tool';
    const envVarName = 'DOTFILES_INSTALLING_FAILING_HOOK_TOOL';

    let envVarDuringHook: string | undefined;

    const afterInstallHook = mock(async () => {
      // Capture the env var state before throwing
      envVarDuringHook = process.env[envVarName];
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

    // The env var must have been set during hook execution
    expect(envVarDuringHook).toBe('true');

    // Env var must be cleaned up regardless of hook failure
    expect(process.env[envVarName]).toBeUndefined();
  });
});
