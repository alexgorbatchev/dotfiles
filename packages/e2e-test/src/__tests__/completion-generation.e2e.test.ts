import { beforeAll, describe, expect, it } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/core';
import { TestHarness } from '../TestHarness';
import { withMockServer } from '../withMockServer';

describe('E2E: completion generation', () => {
  withMockServer();

  const harness = new TestHarness({
    testDir: import.meta.dir,
    platform: Platform.MacOS,
    architecture: Architecture.Arm64,
  });

  beforeAll(async () => {
    await harness.clean();
  });

  it('should generate completions after tool installation', async () => {
    // Run generate command to create shims
    const generateResult = await harness.generate();
    expect(generateResult.exitCode).toBe(0);

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
