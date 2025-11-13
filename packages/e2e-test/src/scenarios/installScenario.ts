import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { TestHarness } from '../TestHarness';

/**
 * Defines test scenarios for the install command.
 *
 * These tests verify that the install command correctly:
 * - Downloads and installs tool binaries
 * - Creates symlinks to installed binaries
 * - Makes binaries executable and accessible through shims
 * - Completes before shims are used
 *
 * @param harness - The TestHarness instance to use for running tests.
 */
export function installScenarios(harness: TestHarness): void {
  const binariesDir = path.join(harness.generatedDir, 'binaries', 'github-release-tool');
  const symlinkPath = path.join(binariesDir, 'github-release-tool');

  describe('install command', () => {
    beforeAll(async () => {
      await harness.clean();
      const result = await harness.generate();
      expect(result.exitCode).toBe(0);
    });

    it('should install github-release-tool and verify binary is downloaded before shim is called', async () => {
      // Verify the binary symlink does NOT exist before install
      expect(await harness.fileExists(symlinkPath)).toBe(false);

      // Run install command
      const result = await harness.install(['github-release-tool']);
      expect(result.exitCode).toBe(0);

      // Check symlink exists
      expect(await harness.fileExists(symlinkPath)).toBe(true);

      // Verify symlink is executable
      expect(await harness.isExecutable(symlinkPath)).toBe(true);

      // Now verify the binary works by executing it
      await harness.verifyShim('github-release-tool', {
        args: ['--version'],
        expectedExitCode: 0,
        stdoutMatcher: (stdout) => stdout === '1.0.0',
      });
    });
  });
}
