import { beforeEach, describe, expect, it } from 'bun:test';
import type { InstallContext } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import type { $ } from 'bun';
import { installFromBrew } from '../installFromBrew';
import type { BrewToolConfig } from '../schemas';

describe('installFromBrew', () => {
  let logger: TestLogger;
  let mockShell: typeof $;

  beforeEach(() => {
    logger = new TestLogger();

    mockShell = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
      let stdout = '';

      if (cmd.includes('brew --prefix')) {
        stdout = '/opt/homebrew/opt/test-tool';
      } else if (cmd.includes('brew info --json')) {
        stdout = JSON.stringify([{ name: 'test-tool', versions: { stable: '1.2.3' } }]);
      } else if (cmd.includes('--version')) {
        stdout = 'tool version 1.2.3';
      }

      const result = {
        stdout: Buffer.from(stdout),
        stderr: Buffer.from(''),
        exitCode: 0,
        toString: () => stdout,
      };

      const promise = Promise.resolve(result);
      // biome-ignore lint/suspicious/noExplicitAny: Mocking shell promise
      const self = promise as any;
      self.quiet = () => self;
      self.nothrow = () => self;
      self.env = () => self;

      return self;
    }) as unknown as typeof $;
  });

  it('should detect version using brew info when versionArgs are not provided', async () => {
    const toolConfig: BrewToolConfig = {
      name: 'test-tool',
      version: '1.2.3',
      binaries: ['test-tool'],
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
      },
    };

    const context = {
      projectConfig: {
        paths: {
          binariesDir: '/bin',
          shellScriptsDir: '/scripts',
          dotfilesDir: '/dotfiles',
          generatedDir: '/generated',
          homeDir: '/home',
        },
      },
      systemInfo: {
        platform: 'darwin',
        arch: 'arm64',
      },
      toolName: 'test-tool',
      toolDir: '/tool/dir',
      getToolDir: () => '/tool/dir',
      homeDir: '/home',
      binDir: '/bin',
      shellScriptsDir: '/scripts',
      dotfilesDir: '/dotfiles',
      generatedDir: '/generated',
      installDir: '/install/dir',
      timestamp: '2023-01-01',
      $: mockShell,
      fileSystem: {} as unknown,
      toolConfig: toolConfig,
    } as unknown as InstallContext;

    const result = await installFromBrew(
      'test-tool',
      toolConfig,
      context,
      undefined,
      logger,
      mockShell
    );

    if (!result.success) {
      throw new Error(`Install failed: ${result.error}`);
    }

    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
    expect(result.metadata.formula).toBe('test-tool');
  });

  it('should detect version using CLI when versionArgs are provided', async () => {
    const toolConfig: BrewToolConfig = {
      name: 'test-tool',
      version: '1.2.3',
      binaries: ['test-tool'],
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
        versionArgs: ['--version'],
        versionRegex: 'version (\\d+\\.\\d+\\.\\d+)',
      },
    };

    const context = {
      projectConfig: {
        paths: {
          binariesDir: '/bin',
          shellScriptsDir: '/scripts',
          dotfilesDir: '/dotfiles',
          generatedDir: '/generated',
          homeDir: '/home',
        },
      },
      systemInfo: {
        platform: 'darwin',
        arch: 'arm64',
      },
      toolName: 'test-tool',
      toolDir: '/tool/dir',
      getToolDir: () => '/tool/dir',
      homeDir: '/home',
      binDir: '/bin',
      shellScriptsDir: '/scripts',
      dotfilesDir: '/dotfiles',
      generatedDir: '/generated',
      installDir: '/install/dir',
      timestamp: '2023-01-01',
      $: mockShell,
      fileSystem: {} as unknown,
      toolConfig: toolConfig,
    } as unknown as InstallContext;

    // We need to ensure getBinaryPaths returns something that points to our mock shell command
    // getBinaryPaths uses the prefix we return from brew --prefix.
    // prefix is /opt/homebrew/opt/test-tool
    // binary path will be /opt/homebrew/opt/test-tool/bin/test-tool

    const result = await installFromBrew(
      'test-tool',
      toolConfig,
      context,
      undefined,
      logger,
      mockShell
    );

    if (!result.success) {
      throw new Error(`Install failed: ${result.error}`);
    }

    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
  });
});
