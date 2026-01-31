/**
 * End-to-End Tests for auto-install during generate command.
 *
 * These tests verify that tools with `auto: true` in their install params:
 * - Are automatically installed during the generate command
 * - Have their binaries available after generate completes
 * - Can be executed via shims after generate
 */
import { beforeAll, describe, expect, it } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';
import { Architecture, Platform } from '@dotfiles/core';
import path from 'node:path';
import { TestHarness } from './helpers/TestHarness';
import { withMockServer } from './helpers/withMockServer';

describe('E2E: auto-install during generate', () => {
  withMockServer();

  const platformConfigs: ReadonlyArray<{
    platform: Platform;
    architecture: Architecture;
    name: string;
  }> = [
    { platform: Platform.MacOS, architecture: Architecture.Arm64, name: 'macOS ARM64' },
    { platform: Platform.Linux, architecture: Architecture.X86_64, name: 'Linux x86_64' },
  ];

  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      // Create a separate harness for auto-install tests with its own fixtures
      const harness = new TestHarness({
        testDir: import.meta.dir,
        configPath: 'fixtures/auto-install/config.yaml',
        platform: config.platform,
        architecture: config.architecture,
      });

      const toolDir = path.join(harness.generatedDir, 'binaries', 'auto-install-tool');
      const currentDir = path.join(toolDir, 'current');
      const binaryPath = path.join(currentDir, 'auto-install-tool');

      describe('auto-install during generate', () => {
        beforeAll(async () => {
          // Clean up to ensure fresh state for auto-install testing
          await harness.clean();
        });

        it('should auto-install tool with auto: true during generate', async () => {
          // Verify the binary does NOT exist before generate
          expect(await harness.fileExists(binaryPath)).toBe(false);

          // Run generate command - this should auto-install the tool
          const result = await harness.generate();
          expect(result.code).toBe(0);

          // Verify stdout contains auto-install message
          expect(result.stdout).toContain('Auto-installed: auto-install-tool');

          // Verify the binary was installed
          expect(await harness.fileExists(binaryPath)).toBe(true);

          // Verify the binary is executable
          expect(await harness.isExecutable(binaryPath)).toBe(true);
        });

        it('should generate shim for auto-installed tool', async () => {
          await harness.verifyShim('auto-install-tool');
        });

        it('should execute auto-installed tool via shim', async () => {
          await harness.verifyShim('auto-install-tool', {
            args: ['--version'],
            expectedExitCode: 0,
            stdoutMatcher: (stdout) => stdout.includes('auto-install-tool version 1.0.0'),
          });
        });

        it('should set environment variables from auto-installed tool config', async () => {
          await harness.verifyEnvironmentVariable(
            'auto-install-tool',
            'AUTO_INSTALL_TOOL_HOME',
            '~/.auto-install-tool',
          );
        });

        it('should not reinstall on subsequent generate when already installed', async () => {
          // Run generate again without cleaning
          const result = await harness.generate();
          expect(result.code).toBe(0);

          // Tool is already installed, so no "Auto-installed" message should appear
          expect(result.stdout).not.toContain('Auto-installed: auto-install-tool');

          // Binary should still exist
          expect(await harness.fileExists(binaryPath)).toBe(true);
        });
      });
    });
  }
});
