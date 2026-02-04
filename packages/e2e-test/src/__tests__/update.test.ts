/**
 * End-to-End Tests for the update command.
 *
 * These tests verify that the update command correctly:
 * - Detects and downloads newer versions of tools
 * - Updates installed binaries to the new version
 * - Handles non-existent tools gracefully
 * - Properly integrates with the mock server for version management
 */
import { beforeAll, describe, expect, it } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';
import { Architecture, Platform } from '@dotfiles/core';
import { GITHUB_RELEASE_TOOL, withMockServer } from './helpers/mock-server';
import { TestHarness } from './helpers/TestHarness';

describe('E2E: update command', () => {
  withMockServer((b) => b.withGitHubTool(GITHUB_RELEASE_TOOL));

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
      const harness: TestHarness = new TestHarness({
        testDir: import.meta.dir,
        configPath: 'fixtures/main/config.ts',
        platform: config.platform,
        architecture: config.architecture,
      });

      beforeAll(async () => {
        // Reset mock server versions to defaults before each platform test
        await fetch('http://127.0.0.1:8765/reset-versions');
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);

        // Install the tool first so we can update it
        await harness.verifyShim('github-release-tool', {
          args: ['--version'],
          expectedExitCode: 0,
        });
      });

      describe('update command', () => {
        it('should update github-release-tool from current version to newer version', async () => {
          // Get the current version (should be 1.0.0)
          const versionBefore = await harness.verifyShim('github-release-tool', {
            args: ['--version'],
            expectedExitCode: 0,
          });
          // Handle case where binary outputs additional info lines
          expect(versionBefore.trim()).toBe('1.0.0');

          // Set new version available in mock server
          await fetch('http://127.0.0.1:8765/set-tool-version/repo/github-release-tool/2.0.0');

          // Run update command - should now get the NEW version
          const updateResult = await harness.update('github-release-tool');
          expect(updateResult.code).toBe(0);

          // Verify we now have the NEWER version
          const versionAfter = await harness.verifyShim('github-release-tool', {
            args: ['--version'],
            expectedExitCode: 0,
          });
          expect(versionAfter.trim()).toBe('2.0.0');
        });

        it('should handle updating non-existent tool gracefully', async () => {
          const result = await harness.update('non-existent-tool');
          // Update command should fail gracefully for non-existent tools
          expect(result.code).not.toBe(0);
        });
      });
    });
  }
});
