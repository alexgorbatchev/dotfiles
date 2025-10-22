import { describe, expect, test } from 'bun:test';
import { createTsLogger } from '@dotfiles/logger';
import type { ShellCompletionConfig } from '@dotfiles/schemas';
import { CompletionGenerator } from '../CompletionGenerator';
import type { ICompletionCommandExecutor } from '../types';

class MockCompletionCommandExecutor implements ICompletionCommandExecutor {
  async executeCompletionCommand(cmd: string): Promise<string> {
    if (cmd === 'echo "# test completion"') {
      return '# test completion\n';
    }
    if (cmd === 'echo "test"') {
      return 'test\n';
    }
    return `# Mock completion for: ${cmd}\n`;
  }
}

describe('CompletionGenerator', () => {
  const logger = createTsLogger('test');
  const mockExecutor = new MockCompletionCommandExecutor();
  const generator = new CompletionGenerator(logger, mockExecutor);

  test('should generate completion from command', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "# test completion"',
    };

    const context = {
      toolName: 'test-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const result = await generator.generateCompletionFile(config, 'test-tool', 'zsh', context);

    expect(result.content).toBe('# test completion\n');
    expect(result.filename).toBe('_test-tool');
    expect(result.generatedBy).toBe('command');
    expect(result.targetPath).toContain('completions/_test-tool');
  });

  test('should validate config requires either source or cmd', async () => {
    const config: ShellCompletionConfig = {};

    const context = {
      toolName: 'test-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    expect(generator.generateCompletionFile(config, 'test-tool', 'zsh', context)).rejects.toThrow(
      "either 'cmd' or 'source' must be provided"
    );
  });

  test('should generate correct filename for different shells', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
    };

    const context = {
      toolName: 'my-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const zshResult = await generator.generateCompletionFile(config, 'my-tool', 'zsh', context);
    expect(zshResult.filename).toBe('_my-tool');

    const bashResult = await generator.generateCompletionFile(config, 'my-tool', 'bash', context);
    expect(bashResult.filename).toBe('my-tool.bash');

    const psResult = await generator.generateCompletionFile(config, 'my-tool', 'powershell', context);
    expect(psResult.filename).toBe('my-tool.ps1');
  });

  test('should use custom name when provided', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
      name: 'custom-completion',
    };

    const context = {
      toolName: 'my-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const result = await generator.generateCompletionFile(config, 'my-tool', 'zsh', context);
    expect(result.filename).toBe('custom-completion');
  });

  test('should use custom target directory when provided', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
      targetDir: '/custom/completions',
    };

    const context = {
      toolName: 'my-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const result = await generator.generateCompletionFile(config, 'my-tool', 'zsh', context);
    expect(result.targetPath).toBe('/custom/completions/_my-tool');
  });
});
