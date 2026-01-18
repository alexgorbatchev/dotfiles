import { createShell } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { describe, expect, test } from 'bun:test';
import { CompletionCommandExecutor } from '../CompletionCommandExecutor';

const shell = createShell();

describe('CompletionCommandExecutor', () => {
  const logger = new TestLogger();
  const executor = new CompletionCommandExecutor(logger, shell);

  test('should execute simple shell commands', async () => {
    const result = await executor.executeCompletionCommand('echo "test completion"', 'test-tool', 'zsh', '/tmp');

    expect(result).toContain('test completion');
  });

  test('should handle commands with arguments', async () => {
    const result = await executor.executeCompletionCommand('echo "arg1" "arg2"', 'test-tool', 'bash', '/tmp');

    expect(result).toContain('arg1');
  });

  test('should set working directory correctly', async () => {
    const result = await executor.executeCompletionCommand('pwd', 'test-tool', 'zsh', '/tmp');

    expect(result).toContain('/tmp');
  });

  test('should handle command execution', async () => {
    const result = await executor.executeCompletionCommand('echo "kubectl completion"', 'kubectl', 'zsh', '/tmp');

    expect(result).toContain('kubectl completion');
  });

  test('should handle different shell types', async () => {
    const zshResult = await executor.executeCompletionCommand('echo "zsh completion"', 'tool', 'zsh', '/tmp');

    const bashResult = await executor.executeCompletionCommand('echo "bash completion"', 'tool', 'bash', '/tmp');

    expect(zshResult).toContain('zsh completion');
    expect(bashResult).toContain('bash completion');
  });

  test('should handle command failure with non-zero exit code', async () => {
    expect(executor.executeCompletionCommand('exit 1', 'test-tool', 'zsh', '/tmp')).rejects.toThrow(
      'Completion command failed for test-tool: exit 1',
    );
  });
});
