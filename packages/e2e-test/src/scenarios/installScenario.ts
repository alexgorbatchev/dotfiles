import { describe, expect, it } from 'bun:test';
import type { TestHarness } from '../TestHarness';

/**
 * Install command test scenarios (requires generate to run first)
 * Install command installs a specific tool if not already installed
 */
export function installScenarios(harness: TestHarness): void {
  describe('install command', () => {
    it('should install a specific tool', async () => {
      const result = await harness.install(['fzf']);
      expect(result.exitCode).toBe(0);
    });

    it('should verify tool is accessible after install', async () => {
      // Verify the shim works and downloads binary
      await harness.verifyShim('fzf', {
        args: ['--version'],
        expectedExitCode: 0,
        stdoutMatcher: (stdout) => stdout === '17.07.86',
      });
    });
  });
}
