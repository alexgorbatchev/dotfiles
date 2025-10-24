import { beforeAll, describe, expect, it } from 'bun:test';
import type { TestHarness } from '../TestHarness';

/**
 * Generate command test scenarios
 * @param harness - TestHarness instance
 * @param additionalTests - Optional callback for additional tests that run after generate
 */
export function generateScenarios(harness: TestHarness, additionalTests?: () => void): void {
  describe('generate command', () => {
    beforeAll(async () => {
      await harness.clean();
      const result = await harness.generate();
      expect(result.exitCode).toBe(0);
    });

    it('should generate user-bin and shell-scripts directories', async () => {
      await harness.verifyDir(harness.userBinDir);
      await harness.verifyDir(harness.shellScriptsDir);
    });

    it('should generate shims that are executable', async () => {
      await harness.verifyShim('github-release-tool');
    });

    it('should generate shell init scripts for zsh, bash, and powershell', async () => {
      await harness.verifyShellScript('zsh');
      await harness.verifyShellScript('bash');
      await harness.verifyShellScript('powershell');
    });

    it('should set GITHUB_RELEASE_TOOL environment variable in shell script', async () => {
      await harness.verifyEnvironmentVariable('github-release-tool', 'GITHUB_RELEASE_TOOL_DEFAULT_OPTS', '--color=fg');
      await harness.verifyEnvironmentVariable('github-release-tool', 'GITHUB_RELEASE_TOOL_OTHER_OPTS', '--arg=1');
    });

    it('should set github-release-tool alias in shell script', async () => {
      await harness.verifyAlias('github-release-tool', 'grt', 'github-release-tool --preview "ps -f -p {+}"');
    });

    it('should generate github-release-tool always script', async () => {
      await harness.verifyAlwaysScript('github-release-tool', "bindkey '^]' github-release-tool-jump-to-dir");
    });

    it('should generate github-release-tool once script', async () => {
      await harness.verifyOnceScript('github-release-tool', 'echo "hello from github-release-tool"');
    });

    it('should execute github-release-tool shim and download binary on first run', async () => {
      await harness.verifyShim('github-release-tool', {
        args: ['--version'],
        expectedExitCode: 0,
        stdoutMatcher: (stdout) => {
          // Extract the version from the end of the output, handling logging output
          const lines = stdout.split('\n');
          const versionLine = lines[lines.length - 1] || lines[lines.length - 2] || '';
          return versionLine.trim() === '1.0.0';
        },
      });
    });

    // Execute additional tests if provided
    if (additionalTests) {
      additionalTests();
    }
  });
}
