import { describe, expect, it } from 'bun:test';
import type { TestHarness } from '../../TestHarness';

/**
 * Defines test scenarios for completion generation.
 *
 * These tests verify that the CLI correctly:
 * - Generates shell completions after tool installation
 * - Creates completion files for both zsh and bash
 * - Includes proper completion functions and commands
 *
 * @param harness - The TestHarness instance to use for running tests.
 */
export function completionScenarios(harness: TestHarness): void {
  describe('completion generation', () => {
    it('should generate completions after tool installation', async () => {
      // Verify shim was created
      await harness.verifyShim('curl-script--cmd-completion-test');

      // Install the tool explicitly
      const installResult = await harness.install(['curl-script--cmd-completion-test']);
      expect(installResult.exitCode).toBe(0);

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
}
