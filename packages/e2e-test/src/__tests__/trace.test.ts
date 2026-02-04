/**
 * End-to-End Tests for the --trace flag.
 *
 * These tests verify that:
 * - --trace enables source location logging (file paths appear in output)
 * - Default behavior hides source location logging
 * - --quiet overrides --trace
 */
import { beforeAll, describe, expect, it } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';
import { Architecture, Platform } from '@dotfiles/core';
import { GITHUB_RELEASE_TOOL, withMockServer } from './helpers/mock-server';
import { TestHarness } from './helpers/TestHarness';

describe('E2E: trace configuration', () => {
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
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);
      });

      describe('trace configuration', () => {
        it('should show file paths when --trace is used', async () => {
          const result = await harness.generate(['--trace']);
          expect(result.code).toBe(0);
          expect(result.stdout.trim()).toMatchLooseInlineSnapshot`
            WARN	${/[^\s]+\.ts:\d+/} - Platform overridden to: ${expect.anything}
            WARN	${/[^\s]+\.ts:\d+/} - Arch overridden to: ${expect.anything}
            INFO	${/[^\s]+\.ts:\d+/} - Caching disabled
            INFO	${/[^\s]+\.ts:\d+/} - [system] rm ${expect.anything}
            INFO	${/[^\s]+\.ts:\d+/} - [system] rm ${expect.anything}
            INFO	${/[^\s]+\.ts:\d+/} - [system] write ${expect.anything}
            INFO	${/[^\s]+\.ts:\d+/} - [system] write ${expect.anything}
            INFO	${/[^\s]+\.ts:\d+/} - DONE
          `;
        });

        it('should NOT show file paths when --trace is NOT used', async () => {
          const result = await harness.generate([]);
          expect(result.code).toBe(0);
          expect(result.stdout.trim()).toMatchLooseInlineSnapshot`
            WARN	Platform overridden to: ${expect.anything}
            WARN	Arch overridden to: ${expect.anything}
            INFO	Caching disabled
            INFO	[system] rm ${expect.anything}
            INFO	[system] rm ${expect.anything}
            INFO	[system] write ${expect.anything}
            INFO	[system] write ${expect.anything}
            INFO	DONE
          `;
        });

        it('should NOT show anything when --quiet --trace is used', async () => {
          const result = await harness.generate(['--quiet', '--trace']);
          expect(result.code).toBe(0);
          expect(result.stdout.trim()).toBe('');
        });
      });
    });
  }
});
