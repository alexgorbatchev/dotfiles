import { createShell, type ShellCompletionConfig } from '@dotfiles/core';
import type { IMemFileSystemReturn } from '@dotfiles/file-system';
import { createMemFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CompletionGenerator } from '../CompletionGenerator';
import type { ICompletionGenerationContext } from '../types';

const shell = createShell();

describe('CompletionGenerator', () => {
  let logger: TestLogger;
  let memFs: IMemFileSystemReturn;
  let nodeFs: NodeFileSystem;
  let generator: CompletionGenerator;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    logger = new TestLogger();
    memFs = await createMemFileSystem();
    nodeFs = new NodeFileSystem();
    generator = new CompletionGenerator(logger, memFs.fs, shell);
    testDirs = await createTestDirectories(logger, nodeFs, {
      testName: 'completion-generator',
    });
  });

  afterEach(async () => {
    await nodeFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
  });

  test('should generate completion from command', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "# test completion"',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'test-tool',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const result = await generator.generateCompletionFile(config, 'test-tool', 'zsh', context);

    expect(result.content).toBe('# test completion\n');
    expect(result.filename).toBe('_test-tool');
    expect(result.generatedBy).toBe('command');
    expect(result.targetPath).toContain('completions/_test-tool');
  });

  test('should validate config requires either source, cmd, or url', async () => {
    const config: ShellCompletionConfig = {};

    const context: ICompletionGenerationContext = {
      toolName: 'test-tool',
      toolInstallDir: '/tmp/test',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    expect(generator.generateCompletionFile(config, 'test-tool', 'zsh', context)).rejects.toThrow(
      "either 'cmd', 'source', or 'url' must be provided",
    );
  });

  test('should generate correct filename for different shells', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
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
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
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
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
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
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    await generator.generateAndWriteCompletionFile({
      config,
      toolName: 'my-tool',
      shellType: 'zsh',
      context,
      fs: memFs.fs,
    });

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
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const result = await generator.generateAndWriteCompletionFile({
      config,
      toolName: 'my-tool',
      shellType: 'bash',
      context,
      fs: memFs.fs,
    });

    expect(result.targetPath).toBe('/custom/dir/my-tool.bash');
    const fileExists = await memFs.fs.exists('/custom/dir/my-tool.bash');
    expect(fileExists).toBe(true);

    const fileContent = await memFs.fs.readFile('/custom/dir/my-tool.bash');
    expect(fileContent).toBe('test completion\n');
  });

  test('generateAndWriteCompletionFile should create symlink for source-based completions', async () => {
    // Create source completion file in the toolDir (directory containing .tool.ts)
    const toolDir = '/tools/my-tool';
    const sourceDir = `${toolDir}/completions`;
    const sourcePath = `${sourceDir}/_my-tool`;
    await memFs.fs.ensureDir(sourceDir);
    await memFs.fs.writeFile(sourcePath, '# completion content');

    const config: ShellCompletionConfig = {
      source: 'completions/_my-tool',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: '/install/tool',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
      configFilePath: `${toolDir}/my-tool.tool.ts`,
    };

    const result = await generator.generateAndWriteCompletionFile({
      config,
      toolName: 'my-tool',
      shellType: 'zsh',
      context,
      fs: memFs.fs,
    });

    expect(result.generatedBy).toBe('source');
    expect(result.sourcePath).toBe(sourcePath);

    // Verify symlink was created (not a regular file)
    const targetPath = '/tmp/shell-scripts/zsh/completions/_my-tool';
    const linkTarget = await memFs.fs.readlink(targetPath);
    expect(linkTarget).toBe(sourcePath);
  });

  test('generateAndWriteCompletionFile should resolve glob patterns for source completions', async () => {
    // Create source completion file with version in path within toolDir
    const toolDir = '/tools/rg';
    const sourceDir = `${toolDir}/ripgrep-1.0.0/complete`;
    const sourcePath = `${sourceDir}/_rg`;
    await memFs.fs.ensureDir(sourceDir);
    await memFs.fs.writeFile(sourcePath, '# rg completion');

    const config: ShellCompletionConfig = {
      source: '**/complete/_rg',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'rg',
      toolInstallDir: '/install/tool',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
      configFilePath: `${toolDir}/rg.tool.ts`,
    };

    const result = await generator.generateAndWriteCompletionFile({
      config,
      toolName: 'rg',
      shellType: 'zsh',
      context,
      fs: memFs.fs,
    });

    expect(result.generatedBy).toBe('source');
    expect(result.sourcePath).toBe(sourcePath);

    // Verify symlink was created
    const targetPath = '/tmp/shell-scripts/zsh/completions/_rg';
    const linkTarget = await memFs.fs.readlink(targetPath);
    expect(linkTarget).toBe(sourcePath);
  });

  test('generateAndWriteCompletionFile should throw for missing source file', async () => {
    const toolDir = '/tools/my-tool';
    await memFs.fs.ensureDir(toolDir);

    const config: ShellCompletionConfig = {
      source: 'nonexistent/_completion',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'my-tool',
      toolInstallDir: '/install/tool',
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
      configFilePath: `${toolDir}/my-tool.tool.ts`,
    };

    expect(
      generator.generateAndWriteCompletionFile({
        config,
        toolName: 'my-tool',
        shellType: 'zsh',
        context,
        fs: memFs.fs,
      }),
    ).rejects.toThrow('Completion source file not found');
  });

  test('should use bin for filename when provided and different from toolName', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test completion"',
      bin: 'fnm',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'curl-script--fnm',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const result = await generator.generateCompletionFile(config, 'curl-script--fnm', 'zsh', context);

    expect(result.filename).toBe('_fnm');
    expect(result.targetPath).toContain('completions/_fnm');
  });

  test('should use bin for bash and powershell filenames', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
      bin: 'fd',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'github--fd',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const bashResult = await generator.generateCompletionFile(config, 'github--fd', 'bash', context);
    expect(bashResult.filename).toBe('fd.bash');

    const psResult = await generator.generateCompletionFile(config, 'github--fd', 'powershell', context);
    expect(psResult.filename).toBe('fd.ps1');
  });

  test('should fallback to toolName when bin is not provided', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'ripgrep',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const result = await generator.generateCompletionFile(config, 'ripgrep', 'zsh', context);
    expect(result.filename).toBe('_ripgrep');
  });

  test('should prefer name over bin when both are provided', async () => {
    const config: ShellCompletionConfig = {
      cmd: 'echo "test"',
      bin: 'fnm',
      name: '_custom-name',
    };

    const context: ICompletionGenerationContext = {
      toolName: 'curl-script--fnm',
      toolInstallDir: testDirs.paths.homeDir,
      shellScriptsDir: '/tmp/shell-scripts',
      homeDir: '/tmp/home',
      version: '1.0.0',
    };

    const result = await generator.generateCompletionFile(config, 'curl-script--fnm', 'zsh', context);
    expect(result.filename).toBe('_custom-name');
  });
});
