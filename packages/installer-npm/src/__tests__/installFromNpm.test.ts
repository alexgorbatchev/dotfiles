import type { IInstallContext, Shell } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { installFromNpm } from '../installFromNpm';
import type { NpmToolConfig } from '../schemas';
import { createMockShell } from './helpers/mocks';

describe('installFromNpm', () => {
  let logger: TestLogger;
  let mockShell: Shell;

  beforeEach(() => {
    logger = new TestLogger();
    mockShell = createMockShell();
  });

  it('should install npm package and detect version', async () => {
    const toolConfig: NpmToolConfig = {
      name: 'prettier',
      version: '3.1.0',
      binaries: ['prettier'],
      installationMethod: 'npm',
      installParams: {
        package: 'prettier',
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
      toolName: 'prettier',
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

    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell);

    assert(result.success);
    expect(result.version).toBe('3.1.0');
    expect(result.metadata.packageName).toBe('prettier');
    expect(result.metadata.method).toBe('npm');
    expect(result.binaryPaths).toEqual(['/staging/dir/node_modules/.bin/prettier']);
  });

  it('should use tool name as package name when package is not specified', async () => {
    const toolConfig: NpmToolConfig = {
      name: 'prettier',
      version: '3.1.0',
      binaries: ['prettier'],
      installationMethod: 'npm',
      installParams: {},
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
      toolName: 'prettier',
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

    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell);

    assert(result.success);
    expect(result.metadata.packageName).toBe('prettier');
  });

  it('should fail when installParams is missing', async () => {
    const toolConfig = {
      name: 'prettier',
      version: '3.1.0',
      binaries: ['prettier'],
      installationMethod: 'npm',
    } as unknown as NpmToolConfig;

    const context = {
      stagingDir: '/staging/dir',
      timestamp: '2023-01-01',
      $: mockShell,
      fileSystem: {} as unknown,
      toolConfig: toolConfig,
    } as unknown as IInstallContext;

    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBe('Install parameters not specified');
  });
});
