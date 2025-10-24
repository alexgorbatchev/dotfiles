import { beforeEach, describe, expect, it } from 'bun:test';
import type { TestHarness } from '../TestHarness';

/**
 * Update command test scenarios - updates tools to latest versions
 */
export function updateScenarios(harness: TestHarness, additionalTests?: () => void): void {
  describe('update command', () => {
    // Reset tool to old version before each test
    beforeEach(async () => {
      await fetch('http://localhost:8765/set-tool-version/repo/github-release-tool/1.0.0');
    });

    it('should update github-release-tool from current version to newer version', async () => {
      // Get the current version (should be 1.0.0)
      const versionBefore = await harness.verifyShim('github-release-tool', {
        args: ['--version'],
        expectedExitCode: 0,
      });
      console.log('Version before update:', versionBefore);
      // Handle case where binary outputs additional info lines
      const cleanVersionBefore = versionBefore.split('\n').pop() || versionBefore;
      expect(cleanVersionBefore).toBe('1.0.0');

      // Set new version available in mock server
      await fetch('http://localhost:8765/set-tool-version/repo/github-release-tool/2.0.0');
      
      // Give a moment for the server state to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Run update command - should now get the NEW version
      const updateResult = await harness.update('github-release-tool', ['--yes']);
      console.log('Update stdout:', updateResult.stdout);
      console.log('Update stderr:', updateResult.stderr);
      expect(updateResult.exitCode).toBe(0);

      // Verify we now have the NEWER version
      const versionAfter = await harness.verifyShim('github-release-tool', {
        args: ['--version'],
        expectedExitCode: 0,
      });
      console.log('Version after update:', versionAfter);
      // Handle case where binary outputs additional info lines
      const cleanVersionAfter = versionAfter.split('\n').pop() || versionAfter;
      expect(cleanVersionAfter).toBe('2.0.0');

      // VERSION MUST HAVE CHANGED
      expect(cleanVersionAfter).not.toBe(cleanVersionBefore);
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
