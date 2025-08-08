import { expect, test, describe, beforeEach } from 'bun:test';
import { ToolConfigBuilder } from '../index';
import type { AsyncInstallHook, GithubReleaseInstallParams } from '@types';
import { always } from '@types';
import { TestLogger } from '@testing-helpers';
import { logs } from '@modules/logger';

describe('ToolConfigBuilder', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  test('constructor initializes with default values', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    expect(builder.toolName).toBe('test-tool');
    expect(builder.versionNum).toBe('latest');
    expect(builder.binaries).toEqual([]);
    expect(builder.zshScripts).toEqual([]);
    expect(builder.symlinkPairs).toEqual([]);
    expect(builder.currentInstallationMethod).toBeUndefined();
    expect(builder.currentInstallParams).toBeUndefined();
    expect(builder.completionSettings).toBeUndefined();
  });

  test('bin method sets binaries correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    expect(builder.binaries).toEqual(['test-bin']);

    const builder2 = new ToolConfigBuilder(logger, 'test-tool');
    builder2.bin(['bin1', 'bin2']);
    expect(builder2.binaries).toEqual(['bin1', 'bin2']);
  });

  test('version method sets version correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.version('1.2.3');
    expect(builder.versionNum).toBe('1.2.3');
  });

  test('install method sets installation method and params correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin(['test-bin']); // Add bin to make build valid
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    builder.install('github-release', installParams);
    const config = builder.build();

    expect(config.installationMethod).toBe('github-release');
    if (config.installationMethod === 'github-release') {
      expect(config.installParams).toEqual(installParams);
    }
  });

  test('hooks method sets hooks correctly on installParams', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin(['test-bin']); // Add bin to make build valid
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { beforeInstall: mockHook };
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hooks(hooks);

    const config = builder.build();
    if (config.installationMethod === 'github-release') {
      expect(config.installParams?.hooks).toEqual(hooks);
    }
  });

  test('hooks method does not set hooks and warns if install was not called first', () => {
    const testLogger = new TestLogger();
    const builder = new ToolConfigBuilder(testLogger, 'test-tool');
    const mockHook: AsyncInstallHook = async () => {};
    const hooksData = { beforeInstall: mockHook };
    builder.hooks(hooksData); // Call hooks without install

    // Check internal state directly
    expect(builder.currentInstallParams?.hooks).toBeUndefined();
    
    // Use TestLogger.expect() to verify the warning was logged
    testLogger.expect(
      ['WARN'],
      ['ToolConfigBuilder'],
      ['Configuration field "hooks" ignored: hooks() called for tool "test-tool" before install(). Hooks will not be set as install() was not called first.']
    );
  });

  test('zsh method adds zsh code correctly to zshInit', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.zsh(always`alias ll="ls -l"`);
    builder.zsh(always`export PATH="$HOME/bin:$PATH"`);
    // build() is valid here as zshInit is provided
    expect(builder.build().zshInit).toEqual([always`alias ll="ls -l"`, always`export PATH="$HOME/bin:$PATH"`]);
  });

  test('symlink method adds symlinks correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.symlink('configs/.mytoolrc', '~/.mytoolrc');
    builder.symlink('configs/another.conf', '~/.config/another.conf');
    // build() is valid here as symlinks are provided
    expect(builder.build().symlinks).toEqual([
      { source: 'configs/.mytoolrc', target: '~/.mytoolrc' },
      { source: 'configs/another.conf', target: '~/.config/another.conf' },
    ]);
  });

  test('completions method sets completion configuration correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    const completionConfig = { zsh: { source: 'completion.zsh' } };
    builder.completions(completionConfig);
    expect(builder.completionSettings).toEqual(completionConfig);
  });

  test('build method returns correct ToolConfig object for github-release', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { afterInstall: mockHook };
    const completionConfig = { bash: { source: 'completion.bash' } };

    builder
      .bin(['tool-bin'])
      .version('1.0.0')
      .install('github-release', installParams)
      .hooks(hooks)
      .zsh(always`alias tt="test-tool"`)
      .symlink('config.yml', '~/.config/tool/config.yml')
      .completions(completionConfig);

    const config = builder.build();

    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['tool-bin']);
    expect(config.version).toBe('1.0.0');
    expect(config.installationMethod).toBe('github-release');
    if (config.installationMethod === 'github-release') {
      expect(config.installParams).toEqual({ ...installParams, hooks });
    }
    expect(config.zshInit).toEqual([always`alias tt="test-tool"`]);
    expect(config.symlinks).toEqual([
      { source: 'config.yml', target: '~/.config/tool/config.yml' },
    ]);
    expect(config.completions).toEqual(completionConfig);
  });

  test('build method returns NoInstallToolConfig if binaries are specified but no installation method', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin(['test-bin']);
    const config = builder.build();
    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['test-bin']);
    expect(config.installationMethod).toBe('none');
    expect(config.installParams).toBeUndefined();
    // Ensure other optional fields are undefined if not set
    expect(config.zshInit).toBeUndefined();
    expect(config.symlinks).toBeUndefined();
    expect(config.completions).toBeUndefined();
    expect(config.updateCheck).toBeUndefined();
  });

  test('build method returns NoInstallToolConfig if only zshInit is present', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.zsh(always`alias tt="test-tool"`);
    const config = builder.build();
    expect(config.installationMethod).toBe('none'); // Should be 'none'
    expect(config.installParams).toBeUndefined();
    expect(config.binaries).toEqual([]);
    expect(config.zshInit).toEqual([always`alias tt="test-tool"`]);
  });

  test('build method returns NoInstallToolConfig if only symlinks are present', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.symlink('a', 'b');
    const config = builder.build();
    expect(config.installationMethod).toBe('none'); // Should be 'none'
    expect(config.installParams).toBeUndefined();
    expect(config.binaries).toEqual([]);
    expect(config.symlinks).toEqual([{ source: 'a', target: 'b' }]);
  });

  test('build method throws error if nothing is configured', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    expect(() => builder.build()).toThrow(
      'Required configuration missing: tool definition. Example: Tool "test-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
    );
  });

  test('build method returns NoInstallToolConfig with binaries if set, but no install method', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin(['my-binary']);
    const config = builder.build();
    expect(config.installationMethod).toBe('none'); // Should be 'none'
    expect(config.installParams).toBeUndefined();
    expect(config.binaries).toEqual(['my-binary']);
  });

  test('build method should log error when invalid installation method is set', () => {
    const testLogger = new TestLogger();
    const builder = new ToolConfigBuilder(testLogger, 'test-tool');
    builder.bin(['test-binary']);
    // Manually set an invalid installation method to test the switch default case
    (builder as any).currentInstallationMethod = 'invalid-method';
    builder.currentInstallParams = { repo: 'test/repo' };

    let thrownError: Error | null = null;
    try {
      builder.build();
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toContain('Invalid installationMethod');

    testLogger.expect(['ERROR'], ['ToolConfigBuilder'], [
      logs.config.error.invalid(
        'installationMethod',
        'invalid-method',
        'github-release | brew | curl-script | curl-tar | manual'
      )
    ]);
  });

  test('build method should log error when no configuration is provided', () => {
    const testLogger = new TestLogger();
    const builder = new ToolConfigBuilder(testLogger, 'empty-tool');
    // Don't set any configuration - this should trigger the "nothing configured" error

    let thrownError: Error | null = null;
    try {
      builder.build();
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toContain('Required configuration missing: tool definition');

    testLogger.expect(['ERROR'], ['ToolConfigBuilder'], [
      logs.config.error.required(
        'tool definition',
        'Tool "empty-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
      )
    ]);
  });
});
