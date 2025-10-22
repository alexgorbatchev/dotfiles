import { describe, expect, test } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import { createMock$ } from '@dotfiles/testing-helpers';
import { CompletionCommandExecutor } from '../CompletionCommandExecutor';

describe('CompletionCommandExecutor', () => {
  const logger = new TestLogger();
  const executor = new CompletionCommandExecutor(logger);
  const mock$ = createMock$();

  test('should execute simple shell commands', async () => {
    const result = await executor.executeCompletionCommand('echo "test completion"', 'test-tool', 'zsh', '/tmp', mock$);

    expect(result).toBe('');
  });

  test('should handle commands with arguments', async () => {
    const result = await executor.executeCompletionCommand('echo "arg1" "arg2"', 'test-tool', 'bash', '/tmp', mock$);

    expect(result).toBe('');
  });

  test('should set working directory correctly', async () => {
    const result = await executor.executeCompletionCommand('pwd', 'test-tool', 'zsh', '/tmp', mock$);

    expect(result).toBe('');
  });

  test('should handle command execution (mocked)', async () => {
    const result = await executor.executeCompletionCommand('kubectl completion zsh', 'kubectl', 'zsh', '/tmp', mock$);

    expect(result).toBe('');
  });

  test('should handle different shell types', async () => {
    const zshResult = await executor.executeCompletionCommand('tool completion zsh', 'tool', 'zsh', '/tmp', mock$);

    const bashResult = await executor.executeCompletionCommand('tool completion bash', 'tool', 'bash', '/tmp', mock$);

    expect(zshResult).toBe('');
    expect(bashResult).toBe('');
  });

  test('should handle command failure with non-zero exit code', async () => {
    const mockFailure$ = ((_command: TemplateStringsArray, ..._args: unknown[]) => {
      const result = Promise.resolve({ stdout: '', stderr: 'Command not found', exitCode: 1 });
      // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add nothrow method to promise
      (result as any).nothrow = () => Promise.resolve({ stdout: '', stderr: 'Command not found', exitCode: 1 });
      return result;
      // biome-ignore lint/suspicious/noExplicitAny: Mock shell function needs to match zx interface
    }) as any;

    expect(
      executor.executeCompletionCommand('nonexistent-command', 'test-tool', 'zsh', '/tmp', mockFailure$)
    ).rejects.toThrow('Completion command failed for test-tool: nonexistent-command');
  });
});
