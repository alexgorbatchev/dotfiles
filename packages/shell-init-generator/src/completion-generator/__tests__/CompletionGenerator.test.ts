import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ShellCompletionConfig } from '@dotfiles/core';
import type { IMemFileSystemReturn } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { CompletionGenerator } from '../CompletionGenerator';
import type { ICompletionGenerationContext } from '../types';

describe('CompletionGenerator', () => {
  let logger: TestLogger;
  let memFs: IMemFileSystemReturn;
  let generator: CompletionGenerator;
  let realTempDir: string;

  beforeEach(async () => {
    logger = new TestLogger();
    memFs = await createMemFileSystem();
    generator = new CompletionGenerator(logger, memFs.fs);
    realTempDir = await mkdtemp(path.join(tmpdir(), 'completion-test-'));
  });

  afterEach(async () => {
    await rm(realTempDir, { recursive: true, force: true });
  });

  test('should generate completion from command', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "# test completion"',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'test-tool',
      toolInstallDir: realTempDir,
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

    const context: ICompletionGenerationContext = {
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

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: realTempDir,
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

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: realTempDir,
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

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: realTempDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const result = await generator.generateCompletionFile(config, 'my-tool', 'zsh', context);
    expect(result.targetPath).toBe('/custom/completions/_my-tool');
  });

  test('generateAndWriteCompletionFile should generate completion and write to file system', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test completion"',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: realTempDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    await generator.generateAndWriteCompletionFile(config, 'my-tool', 'zsh', context);

    const expectedPath = '/tmp/shell-scripts/zsh/completions/_my-tool';
    const fileExists = await memFs.fs.exists(expectedPath);
    expect(fileExists).toBe(true);

    const fileContent = await memFs.fs.readFile(expectedPath);
    expect(fileContent).toBe('test completion\n');
  });

  test('generateAndWriteCompletionFile should write to custom target directory', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test completion"',
      targetDir: '/custom/dir',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: realTempDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
    };

    const result = await generator.generateAndWriteCompletionFile(config, 'my-tool', 'bash', context);

    expect(result.targetPath).toBe('/custom/dir/my-tool.bash');
    const fileExists = await memFs.fs.exists('/custom/dir/my-tool.bash');
    expect(fileExists).toBe(true);

    const fileContent = await memFs.fs.readFile('/custom/dir/my-tool.bash');
    expect(fileContent).toBe('test completion\n');
  });
});
