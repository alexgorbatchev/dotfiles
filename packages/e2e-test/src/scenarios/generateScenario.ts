import { beforeAll, describe, expect, it } from 'bun:test';
import type { TestHarness } from '../TestHarness';

/**
 * Defines test scenarios for the generate command.
 *
 * These tests verify that the generate command correctly creates:
 * - Shim executables for tools
 * - Shell initialization scripts for zsh, bash, and powershell
 * - Environment variables in shell scripts
 * - Aliases in shell scripts
 * - Always and once script blocks
 *
 * @param harness - The TestHarness instance to use for running tests.
 * @param additionalTests - Optional function containing additional test cases.
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

    describe('github-release-tool', () => {
      it('should generate shims that are executable', async () => {
        await harness.verifyShim('github-release-tool');
      });

      it('should generate shell init scripts for zsh, bash, and powershell', async () => {
        await harness.verifyShellScript('zsh');
        await harness.verifyShellScript('bash');
        await harness.verifyShellScript('powershell');
      });

      it('should set GITHUB_RELEASE_TOOL environment variable in shell script', async () => {
        await harness.verifyEnvironmentVariable(
          'github-release-tool',
          'GITHUB_RELEASE_TOOL_DEFAULT_OPTS',
          '--color=fg'
        );
        await harness.verifyEnvironmentVariable('github-release-tool', 'GITHUB_RELEASE_TOOL_OTHER_OPTS', '--arg=1');
      });

      it('should set github-release-tool alias in shell script', async () => {
        await harness.verifyAlias('github-release-tool', 'grt', 'github-release-tool --preview "ps -f -p {+}"');
      });

      it('should generate github-release-tool always script', async () => {
        await harness.verifyAlwaysScript('github-release-tool', 'echo "always from github-release-tool"');
      });

      it('should generate github-release-tool once script', async () => {
        await harness.verifyOnceScript('github-release-tool', 'echo "echo from github-release-tool"');
      });

      it('should include github-release-tool completion directory in fpath', async () => {
        const scriptPath = harness.getShellScriptPath('zsh');
        const content = await harness.readFile(scriptPath);
        expect(content).toMatch(/fpath=\(".*\/zsh\/completions" \$fpath\)/);
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
    });

    describe('cargo-quickinstall-tool', () => {
      it('should generate cargo-quickinstall-tool shim that is executable', async () => {
        await harness.verifyShim('cargo-quickinstall-tool');
      });

      it('should set CARGO_QUICKINSTALL_TOOL environment variables in shell script', async () => {
        await harness.verifyEnvironmentVariable(
          'cargo-quickinstall-tool',
          'CARGO_QUICKINSTALL_TOOL_DEFAULT_OPTS',
          '--color=fg'
        );
        await harness.verifyEnvironmentVariable(
          'cargo-quickinstall-tool',
          'CARGO_QUICKINSTALL_TOOL_OTHER_OPTS',
          '--arg=1'
        );
      });

      it('should set cargo-quickinstall-tool alias in shell script', async () => {
        await harness.verifyAlias('cargo-quickinstall-tool', 'cqt', 'cargo-quickinstall-tool --preview "ps -f -p {+}"');
      });

      it('should generate cargo-quickinstall-tool always script', async () => {
        await harness.verifyAlwaysScript('cargo-quickinstall-tool', 'echo "always from cargo-quickinstall-tool"');
      });

      it('should generate cargo-quickinstall-tool once script', async () => {
        await harness.verifyOnceScript('cargo-quickinstall-tool', 'echo "once from cargo-quickinstall-tool"');
      });

      it('should execute cargo-quickinstall-tool shim and download binary on first run', async () => {
        await harness.verifyShim('cargo-quickinstall-tool', {
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
    });

    // Execute additional tests if provided
    if (additionalTests) {
      additionalTests();
    }
  });
}
