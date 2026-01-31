/**
 * End-to-End Tests for completion generation.
 *
 * These tests verify that the CLI correctly:
 * - Generates shell completions after tool installation
 * - Creates completion files for both zsh and bash
 * - Includes proper completion functions and commands
 */
import { beforeAll, describe, expect, it } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';
import { Architecture, Platform } from '@dotfiles/core';
import { withMockServer } from './helpers/mock-server';
import { TestHarness } from './helpers/TestHarness';

describe('E2E: completion generation', () => {
  withMockServer((b) =>
    b.withScript(
      '/mock-install-for-cmd-completion-test.sh',
      'tools/curl-script--cmd-completion-test/mock-install-for-cmd-completion-test.sh',
    )
  );

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
        configPath: 'fixtures/main/config.yaml',
        platform: config.platform,
        architecture: config.architecture,
      });

      beforeAll(async () => {
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);
      });

      describe('completion generation', () => {
        it('should generate completions after tool installation', async () => {
          // Verify shim was created
          await harness.verifyShim('curl-script--cmd-completion-test');

          // Install the tool explicitly
          const installResult = await harness.install(['curl-script--cmd-completion-test']);
          expect(installResult.code).toBe(0);

          // Verify completion files were generated
          const zshCompletionPath = harness.getCompletionPath('curl-script--cmd-completion-test', 'zsh');
          const bashCompletionPath = harness.getCompletionPath('curl-script--cmd-completion-test', 'bash');

          await harness.verifyFile(zshCompletionPath);
          await harness.verifyFile(bashCompletionPath);

          // Verify completion content contains expected strings
          const zshContent = await harness.readFile(zshCompletionPath);
          expect(zshContent).toContain('#compdef curl-script--cmd-completion-test');
          expect(zshContent).toContain('_curl-script--cmd-completion-test');

          const bashContent = await harness.readFile(bashCompletionPath);
          expect(bashContent).toContain('_curl_script_cmd_completion_test');
          expect(bashContent).toContain('complete -F _curl_script_cmd_completion_test');
        });
      });
    });
  }
});
