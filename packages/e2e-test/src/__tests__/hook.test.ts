/**
 * End-to-End Tests for after-install hooks.
 *
 * These tests verify that:
 * - After-install hooks execute correctly
 * - The process exits cleanly after hook execution (no hangs)
 * - Shell command output is not duplicated (logged via logger only)
 */
import { Architecture, Platform } from '@dotfiles/core';
import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { HOOK_TEST_TOOL, withMockServer } from './helpers/mock-server';
import { TestHarness } from './helpers/TestHarness';

// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';

describe('E2E: after-install hooks', () => {
  withMockServer((b) => b.withGitHubTool(HOOK_TEST_TOOL));

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

      const toolDir = path.join(harness.generatedDir, 'binaries', 'hook-test-tool');
      const currentDir = path.join(toolDir, 'current');
      const binaryPath = path.join(currentDir, 'hook-test-tool');

      beforeAll(async () => {
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);
      });

      describe('after-install hooks', () => {
        beforeAll(async () => {
          // Clean up binaries directory to ensure fresh install
          await harness.cleanBinaries();
        });

        it('should install tool with after-install hook and exit cleanly', async () => {
          // Verify the binary does NOT exist before install
          expect(await harness.fileExists(binaryPath)).toBe(false);

          // Run install command - this should NOT hang
          // If the process hangs, the test will timeout
          const result = await harness.install(['hook-test-tool']);

          // Verify the install completed successfully
          expect(result.code).toBe(0);

          // Verify the binary was installed
          expect(await harness.fileExists(binaryPath)).toBe(true);

          // Verify the binary is executable
          expect(await harness.isExecutable(binaryPath)).toBe(true);
        });

        it('should log stdout and stderr with proper prefixes', async () => {
          // Clean and reinstall to capture fresh output
          await harness.cleanBinaries();

          const result = await harness.install(['hook-test-tool']);
          expect(result.code).toBe(0);

          expect(result.stdout.trim()).toMatchLooseInlineSnapshot`
            WARN	Platform overridden to: ${expect.anything}
            WARN	Arch overridden to: ${expect.anything}
            INFO	Caching disabled
            INFO	[hook-test-tool] mkdir ${expect.anything}binaries/hook-test-tool
            INFO	[hook-test-tool] mkdir ${expect.anything}binaries/hook-test-tool/${expect.anything}
            INFO	[hook-test-tool] rm ${expect.anything}binaries/hook-test-tool/${expect.anything}
            INFO	[hook-test-tool] mv ${expect.anything}binaries/hook-test-tool/${expect.anything} ${expect.anything}binaries/hook-test-tool/1.0.0
            INFO	[hook-test-tool] ln -s 1.0.0 ${expect.anything}binaries/hook-test-tool/current
            INFO	[hook-test-tool] $ echo "shell-output-for-hook-test-tool"
            INFO	[hook-test-tool] | shell-output-for-hook-test-tool
            INFO	[hook-test-tool] $ ./scripts/test-output.sh
            INFO	[hook-test-tool] | Starting initialization...
            ERROR	[hook-test-tool] | Warning: this is a test warning
            INFO	[hook-test-tool] | Loading configuration...
            ERROR	[hook-test-tool] | Error: simulated error message
            INFO	[hook-test-tool] | Processing data...
            ERROR	[hook-test-tool] | Another stderr line
            INFO	[hook-test-tool] | Initialization complete!
            INFO	Tool "hook-test-tool" \`1.0.0\` installed successfully using github-release
          `;
        });
      });
    });
  }
});
