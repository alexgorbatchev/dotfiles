import { beforeEach, describe, expect, test } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import {
  type AsyncInstallHook,
  always,
  type GithubReleaseInstallParams,
  isGitHubReleaseToolConfig,
} from '@dotfiles/schemas';
import { messages } from '../log-messages';
import { ToolConfigBuilder } from '../toolConfigBuilder';

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
    expect(builder.shellConfigs.zsh.scripts).toEqual([]);
    expect(builder.symlinkPairs).toEqual([]);
    expect(builder.currentInstallationMethod).toBeUndefined();
    expect(builder.currentInstallParams).toBeUndefined();
  });

  test('bin method sets binaries correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    expect(builder.binaries).toEqual([{ name: 'test-bin', pattern: '*/test-bin' }]);

    const builder2 = new ToolConfigBuilder(logger, 'test-tool');
    builder2.bin('bin1').bin('bin2');
    expect(builder2.binaries).toEqual([
      { name: 'bin1', pattern: '*/bin1' },
      { name: 'bin2', pattern: '*/bin2' },
    ]);
  });

  test('version method sets version correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.version('1.2.3');
    expect(builder.versionNum).toBe('1.2.3');
  });

  test('install method sets installation method and params correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin'); // Add bin to make build valid
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    builder.install('github-release', installParams);
    const config = builder.build();

    expect(config.installationMethod).toBe('github-release');
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams).toEqual(installParams);
    }
  });

  test('hooks method sets hooks correctly on installParams', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin'); // Add bin to make build valid
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { beforeInstall: mockHook };
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hooks(hooks);

    const config = builder.build();
    if (isGitHubReleaseToolConfig(config)) {
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
    expect(builder.currentInstallParams?.['hooks']).toBeUndefined();

    // Use TestLogger.expect() to verify the warning was logged
    testLogger.expect(
      ['WARN'],
      ['ToolConfigBuilder'],
      [
        messages.configurationFieldIgnored(
          'hooks',
          'hooks() called for tool "test-tool" before install(). Hooks will not be set as install() was not called first.'
        ),
      ]
    );
  });

  test('zsh method adds zsh code correctly to zshInit', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.zsh({ shellInit: [always`alias ll="ls -l"`] });
    builder.zsh({ shellInit: [always`export PATH="$HOME/bin:$PATH"`] });
    // build() is valid here as zshInit is provided
    const config = builder.build();
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      always`alias ll="ls -l"`,
      always`export PATH="$HOME/bin:$PATH"`,
    ]);
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

  test('build method returns correct ToolConfig object for github-release', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { afterInstall: mockHook };

    builder
      .bin('tool-bin')
      .version('1.0.0')
      .install('github-release', installParams)
      .hooks(hooks)
      .zsh({
        shellInit: [always`alias tt="test-tool"`],
        completions: { source: 'completion.bash' },
      })
      .symlink('config.yml', '~/.config/tool/config.yml');

    const config = builder.build();

    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['tool-bin']);
    expect(config.version).toBe('1.0.0');
    expect(config.installationMethod).toBe('github-release');
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams).toEqual({ ...installParams, hooks });
    }
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always`alias tt="test-tool"`]);
    expect(config.shellConfigs?.zsh?.completions).toEqual({ source: 'completion.bash' });
    expect(config.symlinks).toEqual([{ source: 'config.yml', target: '~/.config/tool/config.yml' }]);
  });

  test('build method returns ManualToolConfig if binaries are specified but no installation method', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    const config = builder.build();
    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['test-bin']);
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    // Ensure other optional fields are undefined if not set
    expect(config.shellConfigs).toBeUndefined();
    expect(config.symlinks).toBeUndefined();
    expect(config.updateCheck).toBeUndefined();
  });

  test('build method returns ManualToolConfig if only zshInit is present', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.zsh({ shellInit: [always`alias tt="test-tool"`] });
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always`alias tt="test-tool"`]);
  });

  test('build method returns ManualToolConfig if only symlinks are present', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.symlink('a', 'b');
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.symlinks).toEqual([{ source: 'a', target: 'b' }]);
  });

  test('build method throws error if nothing is configured', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    expect(() => builder.build()).toThrow(
      'Required configuration missing: tool definition. Example: Tool "test-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
    );
  });

  test('build method returns ManualToolConfig with binaries if set, but no install method', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');
    builder.bin('my-binary');
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual(['my-binary']);
  });

  test('build method should log error when invalid installation method is set', () => {
    const testLogger = new TestLogger();
    const builder = new ToolConfigBuilder(testLogger, 'test-tool');
    builder.bin('test-binary');
    // Test error handling by forcing an invalid installation method
    // This simulates a corrupted state that should never occur in normal usage
    builder.currentInstallationMethod = 'invalid-method';
    builder.currentInstallParams = { repo: 'test/repo' };

    let thrownError: Error | null = null;
    try {
      builder.build();
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toContain('Invalid installationMethod');

    testLogger.expect(
      ['ERROR'],
      ['ToolConfigBuilder'],
      [
        messages.configurationFieldInvalid(
          'installationMethod',
          'invalid-method',
          'github-release | brew | curl-script | curl-tar | cargo | manual'
        ),
      ]
    );
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

    testLogger.expect(
      ['ERROR'],
      ['ToolConfigBuilder'],
      [
        messages.configurationFieldRequired(
          'tool definition',
          'Tool "empty-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
        ),
      ]
    );
  });

  test('zsh method handles aliases correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder.zsh({
      aliases: {
        g: 'git',
        l: 'ls -la',
        v: 'vim',
      },
      shellInit: [always`echo "test init"`],
    });

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
      v: 'vim',
    });
    expect(builder.shellConfigs.zsh.scripts).toHaveLength(1);
  });

  test('bash method handles aliases correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder.bash({
      aliases: {
        g: 'git',
        dc: 'docker-compose',
      },
    });

    expect(builder.shellConfigs.bash.aliases).toEqual({
      g: 'git',
      dc: 'docker-compose',
    });
  });

  test('powershell method handles aliases correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder.powershell({
      aliases: {
        g: 'git',
        cat: 'Get-Content',
      },
    });

    expect(builder.shellConfigs.powershell.aliases).toEqual({
      g: 'git',
      cat: 'Get-Content',
    });
  });

  test('build method includes aliases in shell configs', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-tool').zsh({
      aliases: {
        g: 'git',
        l: 'ls -la',
      },
    });

    const config = builder.build();

    expect(config.shellConfigs?.zsh?.aliases).toBeDefined();
    expect(config.shellConfigs?.zsh?.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
    });
  });

  test('build method stores PowerShell aliases correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-tool').powershell({
      aliases: {
        g: 'git',
        cat: 'Get-Content',
      },
    });

    const config = builder.build();

    expect(config.shellConfigs?.powershell?.aliases).toBeDefined();
    expect(config.shellConfigs?.powershell?.aliases).toEqual({
      g: 'git',
      cat: 'Get-Content',
    });
  });

  test('multiple zsh calls merge aliases correctly', () => {
    const builder = new ToolConfigBuilder(logger, 'test-tool');

    builder
      .zsh({
        aliases: { g: 'git' },
      })
      .zsh({
        aliases: { l: 'ls -la', v: 'vim' },
      });

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
      v: 'vim',
    });
  });
});
