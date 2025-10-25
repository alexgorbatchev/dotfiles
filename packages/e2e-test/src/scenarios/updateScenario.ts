import { describe, expect, it } from 'bun:test';
import type { TestHarness } from '../TestHarness';

export function updateScenarios(harness: TestHarness, additionalTests?: () => void): void {
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
      await fetch('http://localhost:8765/set-tool-version/repo/github-release-tool/2.0.0');

      // Run update command - should now get the NEW version
      const updateResult = await harness.update('github-release-tool', ['--yes']);
      expect(updateResult.exitCode).toBe(0);

      // Verify we now have the NEWER version
      const versionAfter = await harness.verifyShim('github-release-tool', {
        args: ['--version'],
        expectedExitCode: 0,
      });
      expect(versionAfter.trim()).toBe('2.0.0');
    });

    it('should handle updating non-existent tool gracefully', async () => {
      const result = await harness.update('non-existent-tool', ['--yes']);
      // Update command should fail gracefully for non-existent tools
      expect(result.exitCode).not.toBe(0);
    });

    // Execute additional tests if provided
    if (additionalTests) {
      additionalTests();
    }
  });
}
