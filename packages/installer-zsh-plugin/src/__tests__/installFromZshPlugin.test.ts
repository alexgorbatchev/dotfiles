import type { IInstallContext, Shell } from '@dotfiles/core';
import { createMemFileSystem, type IResolvedFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import { installFromZshPlugin } from '../installFromZshPlugin';
import type { ZshPluginToolConfig } from '../schemas';

interface IMockShellPromise extends
  Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    code: number;
    toString: () => string;
  }>
{
  quiet: () => IMockShellPromise;
  nothrow: () => IMockShellPromise;
  noThrow: () => IMockShellPromise;
  env: () => IMockShellPromise;
}

describe('installFromZshPlugin', () => {
  let mockFs: IResolvedFileSystem;
  let logger: TestLogger;
  let mockShell: Shell;
  let context: IInstallContext;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFs = new ResolvedFileSystem(fs, '/home');
    logger = new TestLogger();

    // Create a mock shell that returns success and simulates git clone by creating files
    mockShell = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
      let stdout = 'abc1234';
      let fileCreationPromise: Promise<void> = Promise.resolve();

      if (cmd.includes('describe --tags')) {
        stdout = 'v0.1.0';
      } else if (cmd.includes('rev-parse --short')) {
        stdout = 'abc1234';
      } else if (cmd.includes('git clone')) {
        // Extract destination path from clone command and create plugin file
        const destMatch = cmd.match(/git clone --depth 1 .+ (.+)$/);
        if (destMatch?.[1]) {
          const destPath = destMatch[1];
          const pluginName = destPath.split('/').pop() ?? 'plugin';
          // Create the plugin source file in the cloned directory
          fileCreationPromise = mockFs
            .mkdir(destPath, { recursive: true })
            .then(() => mockFs.writeFile(`${destPath}/${pluginName}.plugin.zsh`, '# plugin content'));
        }
      }

      const result = {
        stdout,
        stderr: '',
        exitCode: 0,
        code: 0,
        toString: () => stdout,
      };

      // Return promise that waits for file creation before resolving
      const promise = fileCreationPromise.then(() => result) as IMockShellPromise;
      promise.quiet = () => promise;
      promise.nothrow = () => promise;
      promise.noThrow = () => promise;
      promise.env = () => promise;

      return promise;
    }) as unknown as Shell;

    context = {
      projectConfig: {
        paths: {
          binariesDir: '/bin',
          shellScriptsDir: '/scripts',
          dotfilesDir: '/dotfiles',
          generatedDir: '/generated',
          homeDir: '/home',
          hostname: 'test-host',
        },
      },
      systemInfo: {
        platform: 'darwin',
        arch: 'arm64',
      },
      stagingDir: '/tmp/plugins',
      currentDir: '/bin/zsh-plugins/current',
    } as unknown as IInstallContext;
  });

  it('should return error when no params provided', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'test-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: undefined as unknown as ZshPluginToolConfig['installParams'],
    };

    const result = await installFromZshPlugin(
      'test-plugin',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('No install parameters');
    }
  });

  it('should return error when neither repo nor url provided', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'test-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {} as ZshPluginToolConfig['installParams'],
    };

    const result = await installFromZshPlugin(
      'test-plugin',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('repo or url');
    }
  });

  it('should clone plugin from GitHub shorthand', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'zsh-vi-mode',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'jeffreytse/zsh-vi-mode',
        source: 'zsh-vi-mode.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'zsh-vi-mode',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.pluginName).toBe('zsh-vi-mode');
      expect(result.metadata.gitUrl).toBe('https://github.com/jeffreytse/zsh-vi-mode.git');
      expect(result.metadata.method).toBe('zsh-plugin');
    }
  });

  it('should clone plugin from full URL', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'custom-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        url: 'https://gitlab.com/user/custom-plugin.git',
        source: 'custom-plugin.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'custom-plugin',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.pluginName).toBe('custom-plugin');
      expect(result.metadata.gitUrl).toBe('https://gitlab.com/user/custom-plugin.git');
    }
  });

  it('should use custom pluginName when provided', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'vi-mode',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'jeffreytse/zsh-vi-mode',
        pluginName: 'vi-mode',
        source: 'vi-mode.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'vi-mode',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.pluginName).toBe('vi-mode');
    }
  });

  it('should return version from git', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'test-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'user/repo',
        source: 'repo.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'test-plugin',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.version).toBe('v0.1.0');
    }
  });

  it('should return empty binaryPaths for plugins', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'test-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'user/repo',
        source: 'repo.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'test-plugin',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.binaryPaths).toEqual([]);
    }
  });

  it('should emit shellInit with source command for zsh', async () => {
    const toolConfig: ZshPluginToolConfig = {
      name: 'zsh-vi-mode',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'jeffreytse/zsh-vi-mode',
        source: 'zsh-vi-mode.plugin.zsh',
        auto: true,
      },
    };

    const result = await installFromZshPlugin(
      'zsh-vi-mode',
      toolConfig,
      context,
      logger,
      mockFs,
      mockShell,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.shellInit).toBeDefined();
      expect(result.shellInit?.['zsh']).toBeDefined();
      expect(result.shellInit?.['zsh']?.scripts).toHaveLength(1);
      const script = result.shellInit?.['zsh']?.scripts?.[0];
      expect(script).toBeDefined();
      expect(script?.kind).toBe('raw');
      expect(script?.value).toContain('source');
      expect(script?.value).toContain('/bin/zsh-plugins/current/zsh-vi-mode/zsh-vi-mode.plugin.zsh');
    }
  });
});
