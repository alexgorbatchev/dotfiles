import { beforeEach, describe, expect, test } from 'bun:test';
import { type AsyncInstallHook, always } from '@dotfiles/core';
import type { GithubReleaseInstallParams } from '@dotfiles/installer-github';
import { isGitHubReleaseToolConfig } from '@dotfiles/installer-github';
import { TestLogger } from '@dotfiles/logger';
import { messages } from '../log-messages';
import { IToolConfigBuilder } from '../toolConfigBuilder';

describe('IToolConfigBuilder', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  test('constructor initializes with default values', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    expect(builder.toolName).toBe('test-tool');
    expect(builder.versionNum).toBe('latest');
    expect(builder.binaries).toEqual([]);
    expect(builder.shellConfigs.zsh.scripts).toEqual([]);
    expect(builder.symlinkPairs).toEqual([]);
    expect(builder.currentInstallationMethod).toBeUndefined();
    expect(builder.currentInstallParams).toBeUndefined();
  });

  test('bin method sets binaries correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    expect(builder.binaries).toEqual([{ name: 'test-bin', pattern: '*/test-bin' }]);

    const builder2 = new IToolConfigBuilder(logger, 'test-tool');
    builder2.bin('bin1').bin('bin2');
    expect(builder2.binaries).toEqual([
      { name: 'bin1', pattern: '*/bin1' },
      { name: 'bin2', pattern: '*/bin2' },
    ]);
  });

  test('version method sets version correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.version('1.2.3');
    expect(builder.versionNum).toBe('1.2.3');
  });

  test('install method sets installation method and params correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
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
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin'); // Add bin to make build valid
    const mockHook: AsyncInstallHook = async () => {};
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hook('before-install', mockHook);

    const config = builder.build();
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams?.hooks).toEqual({ 'before-install': [mockHook] });
    }
  });

  test('hook method sets individual hook correctly on installParams', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    const mockHook: AsyncInstallHook = async () => {};
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hook('before-install', mockHook);

    const config = builder.build();
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams?.hooks).toEqual({ 'before-install': [mockHook] });
    }
  });

  test('hook method appends multiple hooks for the same event', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    const mockHook1: AsyncInstallHook = async () => {};
    const mockHook2: AsyncInstallHook = async () => {};
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hook('after-install', mockHook1);
    builder.hook('after-install', mockHook2);

    const config = builder.build();
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams?.hooks).toEqual({ 'after-install': [mockHook1, mockHook2] });
    }
  });

  test('hook method supports all lifecycle events', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('test-bin');
    const beforeInstall: AsyncInstallHook = async () => {};
    const afterDownload: AsyncInstallHook = async () => {};
    const afterExtract: AsyncInstallHook = async () => {};
    const afterInstall: AsyncInstallHook = async () => {};
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hook('before-install', beforeInstall);
    builder.hook('after-download', afterDownload);
    builder.hook('after-extract', afterExtract);
    builder.hook('after-install', afterInstall);

    const config = builder.build();
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams?.hooks).toEqual({
        'before-install': [beforeInstall],
        'after-download': [afterDownload],
        'after-extract': [afterExtract],
        'after-install': [afterInstall],
      });
    }
  });

  test('hook method does not set hooks and warns if install was not called first', () => {
    const testLogger = new TestLogger();
    const builder = new IToolConfigBuilder(testLogger, 'test-tool');
    const mockHook: AsyncInstallHook = async () => {};
    builder.hook('before-install', mockHook);

    expect(builder.currentInstallParams?.['hooks']).toBeUndefined();

    testLogger.expect(
      ['WARN'],
      ['IToolConfigBuilder'],
      [
        messages.configurationFieldIgnored(
          'hook',
          'hook() called for tool "test-tool" before install(). Hook will not be set as install() was not called first.'
        ),
      ]
    );
  });

  test('zsh method adds zsh code correctly to zshInit', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.zsh((shell) => shell.always(/* zsh */ `alias ll="ls -l"`));
    builder.zsh((shell) => shell.always(/* zsh */ `export PATH="$HOME/bin:$PATH"`));
    // build() is valid here as zshInit is provided
    const config = builder.build();
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      always`alias ll="ls -l"`,
      always`export PATH="$HOME/bin:$PATH"`,
    ]);
  });

  test('zsh functions method adds shell functions correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.zsh((shell) =>
      shell.functions({
        mycommand: 'echo "Running my command"',
        anotherFunc: 'cd /some/path && ./run.sh',
      })
    );
    const config = builder.build();
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      mycommand: 'echo "Running my command"',
      anotherFunc: 'cd /some/path && ./run.sh',
    });
  });

  test('bash functions method adds shell functions correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bash((shell) =>
      shell.functions({
        myfunc: 'echo "hello from bash"',
      })
    );
    const config = builder.build();
    expect(config.shellConfigs?.bash?.functions).toEqual({
      myfunc: 'echo "hello from bash"',
    });
  });

  test('functions method filters out invalid function names and logs error', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.zsh((shell) =>
      shell.functions({
        valid_name: 'echo valid',
        '123invalid': 'echo starts with number',
        'has space': 'echo has space',
        'valid-name': 'echo valid with hyphen',
        'func;injection': 'echo injection attempt',
      })
    );
    const config = builder.build();

    // Only valid names should be kept
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      valid_name: 'echo valid',
      'valid-name': 'echo valid with hyphen',
    });

    // Errors should be logged for invalid names
    logger.expect(
      ['ERROR'],
      ['IToolConfigBuilder', 'ShellConfigurator'],
      [
        /Invalid function name: "123invalid"/,
        /Invalid function name: "has space"/,
        /Invalid function name: "func;injection"/,
      ]
    );
  });

  test('symlink method adds symlinks correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.symlink('configs/.mytoolrc', '~/.mytoolrc');
    builder.symlink('configs/another.conf', '~/.config/another.conf');
    // build() is valid here as symlinks are provided
    expect(builder.build().symlinks).toEqual([
      { source: 'configs/.mytoolrc', target: '~/.mytoolrc' },
      { source: 'configs/another.conf', target: '~/.config/another.conf' },
    ]);
  });

  test('build method returns correct ToolConfig object for github-release', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    const mockHook: AsyncInstallHook = async () => {};

    builder
      .bin('tool-bin')
      .version('1.0.0')
      .install('github-release', installParams)
      .hook('after-install', mockHook)
      .zsh((shell) => shell.always(/* zsh */ `alias tt="test-tool"`).completions('completion.bash'))
      .symlink('config.yml', '~/.config/tool/config.yml');

    const config = builder.build();

    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['tool-bin']);
    expect(config.version).toBe('1.0.0');
    expect(config.installationMethod).toBe('github-release');
    if (isGitHubReleaseToolConfig(config)) {
      expect(config.installParams).toEqual({ ...installParams, hooks: { 'after-install': [mockHook] } });
    }
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always`alias tt="test-tool"`]);
    expect(config.shellConfigs?.zsh?.completions).toBe('completion.bash');
    expect(config.symlinks).toEqual([{ source: 'config.yml', target: '~/.config/tool/config.yml' }]);
  });

  test('completions preserves the configured bin option', () => {
    const builder = new IToolConfigBuilder(logger, 'curl-script--fnm');

    builder.zsh((shell) =>
      shell.completions({
        cmd: 'fnm completions --shell zsh',
        bin: 'fnm',
      })
    );

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.completions).toEqual({
      cmd: 'fnm completions --shell zsh',
      bin: 'fnm',
    });
  });

  test('completions accepts callback function for dynamic resolution', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    const completionsCallback = (ctx: { version?: string }) => ({
      url: `https://example.com/completions/${ctx.version}/completion.zsh`,
    });

    builder.zsh((shell) => shell.completions(completionsCallback));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.completions).toBe(completionsCallback);
  });

  test('zsh source generates non-fatal conditional sourcing', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.zsh((shell) => shell.source('/path/that/does/not/exist'));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      always`[[ -f "/path/that/does/not/exist" ]] && source "/path/that/does/not/exist"`,
    ]);
  });

  test('bash source generates non-fatal conditional sourcing', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bash((shell) => shell.source('/path/that/does/not/exist'));

    const config = builder.build();
    expect(config.shellConfigs?.bash?.scripts).toEqual([
      always`[[ -f "/path/that/does/not/exist" ]] && source "/path/that/does/not/exist"`,
    ]);
  });

  test('build method returns ManualToolConfig if binaries are specified but no installation method', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
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
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.zsh((shell) => shell.always(/* zsh */ `alias tt="test-tool"`));
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always`alias tt="test-tool"`]);
  });

  test('build method returns ManualToolConfig if only symlinks are present', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.symlink('a', 'b');
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.symlinks).toEqual([{ source: 'a', target: 'b' }]);
  });

  test('build method throws error if nothing is configured', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    expect(() => builder.build()).toThrow(
      'Required configuration missing: tool definition. Example: Tool "test-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
    );
  });

  test('build method returns ManualToolConfig with binaries if set, but no install method', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');
    builder.bin('my-binary');
    const config = builder.build();
    expect(config.installationMethod).toBe('manual');
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual(['my-binary']);
  });

  test('build method should log error when invalid installation method is set', () => {
    const testLogger = new TestLogger();
    const builder = new IToolConfigBuilder(testLogger, 'test-tool');
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
      ['IToolConfigBuilder'],
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
    const builder = new IToolConfigBuilder(testLogger, 'empty-tool');
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
      ['IToolConfigBuilder'],
      [
        messages.configurationFieldRequired(
          'tool definition',
          'Tool "empty-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs'
        ),
      ]
    );
  });

  test('zsh method handles aliases correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.zsh((shell) =>
      shell
        .aliases({
          g: 'git',
          l: 'ls -la',
          v: 'vim',
        })
        .always(always`echo "test init"`)
    );

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
      v: 'vim',
    });
    expect(builder.shellConfigs.zsh.scripts).toHaveLength(1);
  });

  test('bash method handles aliases correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bash((shell) =>
      shell.aliases({
        g: 'git',
        dc: 'docker-compose',
      })
    );

    expect(builder.shellConfigs.bash.aliases).toEqual({
      g: 'git',
      dc: 'docker-compose',
    });
  });

  test('powershell method handles aliases correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.powershell((shell) =>
      shell.aliases({
        g: 'git',
        cat: 'Get-Content',
      })
    );

    expect(builder.shellConfigs.powershell.aliases).toEqual({
      g: 'git',
      cat: 'Get-Content',
    });
  });

  test('build method includes aliases in shell configs', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-tool').zsh((shell) =>
      shell.aliases({
        g: 'git',
        l: 'ls -la',
      })
    );

    const config = builder.build();

    expect(config.shellConfigs?.zsh?.aliases).toBeDefined();
    expect(config.shellConfigs?.zsh?.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
    });
  });

  test('build method stores PowerShell aliases correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-tool').powershell((shell) =>
      shell.aliases({
        g: 'git',
        cat: 'Get-Content',
      })
    );

    const config = builder.build();

    expect(config.shellConfigs?.powershell?.aliases).toBeDefined();
    expect(config.shellConfigs?.powershell?.aliases).toEqual({
      g: 'git',
      cat: 'Get-Content',
    });
  });

  test('multiple zsh calls merge aliases correctly', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.zsh((shell) => shell.aliases({ g: 'git' })).zsh((shell) => shell.aliases({ l: 'ls -la', v: 'vim' }));

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: 'git',
      l: 'ls -la',
      v: 'vim',
    });
  });

  test('disable method sets disabled to true', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-bin').install('github-release', { repo: 'owner/repo' }).disable();

    const config = builder.build();
    expect(config.disabled).toBe(true);
  });

  test('disable method returns builder for chaining', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    const result = builder.disable();
    expect(result).toBe(builder);
  });

  test('build method includes disabled property when set', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-bin').disable();

    const config = builder.build();
    expect(config.disabled).toBe(true);
    expect(config.name).toBe('test-tool');
    expect(config.installationMethod).toBe('manual');
  });

  test('build method does not include disabled property when not set', () => {
    const builder = new IToolConfigBuilder(logger, 'test-tool');

    builder.bin('test-bin');

    const config = builder.build();
    expect(config.disabled).toBeUndefined();
  });
});
