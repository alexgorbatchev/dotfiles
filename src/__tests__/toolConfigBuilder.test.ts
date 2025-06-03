/**
 * Development Plan:
 *
 * Write tests for the ToolConfigBuilder class.
 *
 * Tasks:
 * - Test the constructor initializes the config with default values.
 * - Test the 'bin' method correctly sets the binaries.
 * - Test the 'version' method correctly sets the version.
 * - Test the 'install' method correctly sets the installation method and parameters.
 * - Test the 'hooks' method correctly sets the hooks on installParams.
 * - Test the 'zsh' method correctly adds Zsh code to zshInit.
 * - Test the 'symlink' method correctly adds symlinks.
 * - Test the 'arch' method correctly stores architecture overrides.
 * - Test the 'completions' method correctly sets completion configuration.
 * - Test the 'build' method returns the correct ToolConfig object.
 * - Test the 'build' method throws errors for missing required fields (name, installationMethod if binaries are present).
 * - Cleanup linting errors and warnings.
 * - Ensure 100% test coverage.
 * - Update the memory bank.
 */

import { expect, test, describe } from 'bun:test';
import { ToolConfigBuilder } from '../toolConfigBuilder';
import type { AsyncInstallHook, GithubReleaseInstallParams } from '../types';
import type { IToolConfigBuilder } from '../toolConfigBuilder';

describe('ToolConfigBuilder', () => {
  test('constructor initializes with default values', () => {
    const builder = new ToolConfigBuilder('test-tool');
    // Access internal config for this specific test, as build() would throw
    const internalConfig = (builder as any).config;

    expect(internalConfig.name).toBe('test-tool');
    expect(internalConfig.version).toBe('latest');
    expect(internalConfig.binaries).toEqual([]);
    expect(internalConfig.zshInit).toEqual([]);
    expect(internalConfig.symlinks).toEqual([]);
    expect(internalConfig.installationMethod).toBeUndefined();
    expect(internalConfig.installParams).toBeUndefined();
    expect(internalConfig.completions).toBeUndefined();
  });

  test('bin method sets binaries correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.bin('test-bin');
    expect((builder as any).config.binaries).toEqual(['test-bin']);

    const builder2 = new ToolConfigBuilder('test-tool');
    builder2.bin(['bin1', 'bin2']);
    expect((builder2 as any).config.binaries).toEqual(['bin1', 'bin2']);
  });

  test('version method sets version correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.version('1.2.3');
    expect((builder as any).config.version).toBe('1.2.3');
  });

  test('install method sets installation method and params correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    builder.install('github-release', installParams);
    const config = builder.build(); // build() is valid here

    expect(config.installationMethod).toBe('github-release');
    expect(config.installParams).toEqual(installParams);
  });

  test('hooks method sets hooks correctly on installParams', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { beforeInstall: mockHook };
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };

    builder.install('github-release', installParams);
    builder.hooks(hooks);

    const config = builder.build(); // build() is valid here
    expect(config.installParams?.hooks).toEqual(hooks);
  });

  test('hooks method does not set hooks if install was not called first', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { beforeInstall: mockHook };
    builder.hooks(hooks);
    // Access internal config as build() would throw
    const internalConfig = (builder as any).config;
    expect(internalConfig.installParams?.hooks).toBeUndefined();
  });

  test('zsh method adds zsh code correctly to zshInit', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.zsh('alias ll="ls -l"');
    builder.zsh('export PATH="$HOME/bin:$PATH"');
    // build() is valid here as zshInit is provided
    expect(builder.build().zshInit).toEqual(['alias ll="ls -l"', 'export PATH="$HOME/bin:$PATH"']);
  });

  test('symlink method adds symlinks correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.symlink('configs/.mytoolrc', '~/.mytoolrc');
    builder.symlink('configs/another.conf', '~/.config/another.conf');
    // build() is valid here as symlinks are provided
    expect(builder.build().symlinks).toEqual([
      { source: 'configs/.mytoolrc', target: '~/.mytoolrc' },
      { source: 'configs/another.conf', target: '~/.config/another.conf' },
    ]);
  });

  test('arch method stores architecture overrides correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const overrideFn = (c: IToolConfigBuilder) => {
      c.version('2.0.0');
    };
    builder.arch('darwin-aarch64', overrideFn);
    // Test that the override is stored
    expect((builder as any).osArchOverrides['darwin-aarch64']).toBe(overrideFn);
    // Also check that the main config version is not yet changed
    expect((builder as any).config.version).toBe('latest');
  });

  test('completions method sets completion configuration correctly', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const completionConfig = { zsh: { source: 'completion.zsh' } };
    builder.completions(completionConfig);
    // Access internal config as build() might throw if no other valid config is set
    expect((builder as any).config.completions).toEqual(completionConfig);
  });

  test('build method returns correct ToolConfig object', () => {
    const builder = new ToolConfigBuilder('test-tool');
    const installParams: GithubReleaseInstallParams = { repo: 'owner/repo' };
    const mockHook: AsyncInstallHook = async () => {};
    const hooks = { afterInstall: mockHook };
    const completionConfig = { bash: { source: 'completion.bash' } };

    builder
      .bin(['tool-bin'])
      .version('1.0.0')
      .install('github-release', installParams)
      .hooks(hooks)
      .zsh('alias tt="test-tool"')
      .symlink('config.yml', '~/.config/tool/config.yml')
      .completions(completionConfig);

    const config = builder.build();

    expect(config.name).toBe('test-tool');
    expect(config.binaries).toEqual(['tool-bin']);
    expect(config.version).toBe('1.0.0');
    expect(config.installationMethod).toBe('github-release');
    expect(config.installParams).toEqual({ ...installParams, hooks });
    expect(config.zshInit).toEqual(['alias tt="test-tool"']);
    expect(config.symlinks).toEqual([
      { source: 'config.yml', target: '~/.config/tool/config.yml' },
    ]);
    expect(config.completions).toEqual(completionConfig);
  });

  test('build method throws error if binaries are specified but no installation method', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.bin('test-bin');
    expect(() => builder.build()).toThrow(
      'Installation method is required if binaries are specified.'
    );
  });

  test('build method does not throw error if no binaries and no installation method but zshInit is present', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.zsh('alias tt="test-tool"');
    expect(() => builder.build()).not.toThrow();
    const config = builder.build();
    expect(config.installationMethod).toBeUndefined();
    expect(config.binaries).toEqual([]);
    expect(config.zshInit).toEqual(['alias tt="test-tool"']);
  });

  test('build method does not throw error if no binaries and no installation method but symlinks are present', () => {
    const builder = new ToolConfigBuilder('test-tool');
    builder.symlink('a', 'b');
    expect(() => builder.build()).not.toThrow();
    const config = builder.build();
    expect(config.installationMethod).toBeUndefined();
    expect(config.binaries).toEqual([]);
    expect(config.symlinks).toEqual([{ source: 'a', target: 'b' }]);
  });

  test('build method throws error if no binaries, no install method, no zsh, and no symlinks', () => {
    const builder = new ToolConfigBuilder('test-tool');
    // No configuration calls
    expect(() => builder.build()).toThrow(
      'Installation method is required if no zshInit, symlinks, or binaries are defined.'
    );
  });
});
