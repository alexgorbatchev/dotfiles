import type { IInstallContext, Shell } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { installFromBrew } from '../installFromBrew';
import type { BrewToolConfig } from '../schemas';
import { createMockShell } from './helpers/mocks';

describe('installFromBrew', () => {
  let logger: TestLogger;
  let mockShell: Shell;

  beforeEach(() => {
    logger = new TestLogger();
    mockShell = createMockShell();
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
          hostname: 'test-host',
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
      hostname: 'test-host',
      binDir: '/bin',
      shellScriptsDir: '/scripts',
      dotfilesDir: '/dotfiles',
      generatedDir: '/generated',
      stagingDir: '/staging/dir',
      timestamp: '2023-01-01',
      $: mockShell,
      fileSystem: {} as unknown,
      toolConfig: toolConfig,
    } as unknown as IInstallContext;

    const result = await installFromBrew('test-tool', toolConfig, context, undefined, logger, mockShell);

    assert(result.success);
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
          hostname: 'test-host',
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
      hostname: 'test-host',
      binDir: '/bin',
      shellScriptsDir: '/scripts',
      dotfilesDir: '/dotfiles',
      generatedDir: '/generated',
      stagingDir: '/staging/dir',
      timestamp: '2023-01-01',
      $: mockShell,
      fileSystem: {} as unknown,
      toolConfig: toolConfig,
    } as unknown as IInstallContext;

    // We need to ensure getBinaryPaths returns something that points to our mock shell command
    // getBinaryPaths uses the prefix we return from brew --prefix.
    // prefix is /opt/homebrew/opt/test-tool
    // binary path will be /opt/homebrew/opt/test-tool/bin/test-tool

    const result = await installFromBrew('test-tool', toolConfig, context, undefined, logger, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
  });
});
