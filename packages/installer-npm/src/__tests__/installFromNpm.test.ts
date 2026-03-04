import type { IInstallContext, Shell } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { installFromNpm } from '../installFromNpm';
import type { NpmToolConfig } from '../schemas';
import { createFailingMockShell, createMockShell } from './helpers/mocks';

function createContext(toolConfig: NpmToolConfig, mockShell: Shell): IInstallContext {
  return {
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
    toolName: toolConfig.name,
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
}

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

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell, mockShell);

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

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell, mockShell);

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

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm('prettier', toolConfig, context, undefined, logger, mockShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBe('Install parameters not specified');
  });

  it('should use versionArgs and versionRegex for custom version detection', async () => {
    const versionShell = createMockShell((cmd: string) => {
      if (cmd.includes('npm install')) {
        return { stdout: '', stderr: '', exitCode: 0, code: 0, toString: () => '' };
      }
      if (cmd.includes('--version')) {
        return { stdout: 'mytool v4.2.1', stderr: '', exitCode: 0, code: 0, toString: () => 'mytool v4.2.1' };
      }
      return { stdout: '', stderr: '', exitCode: 0, code: 0, toString: () => '' };
    });

    const toolConfig: NpmToolConfig = {
      name: 'mytool',
      version: '4.2.1',
      binaries: ['mytool'],
      installationMethod: 'npm',
      installParams: {
        package: 'mytool',
        versionArgs: ['--version'],
        versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
      },
    };

    const context = createContext(toolConfig, versionShell);
    const result = await installFromNpm('mytool', toolConfig, context, undefined, logger, versionShell, versionShell);

    assert(result.success);
    expect(result.version).toBe('4.2.1');
    expect(result.metadata.packageName).toBe('mytool');
  });

  it('should return failure when npm install command fails', async () => {
    const failShell = createFailingMockShell();

    const toolConfig: NpmToolConfig = {
      name: 'failing-tool',
      version: '1.0.0',
      binaries: ['failing-tool'],
      installationMethod: 'npm',
      installParams: {
        package: 'failing-tool',
      },
    };

    const context = createContext(toolConfig, failShell);
    const result = await installFromNpm('failing-tool', toolConfig, context, undefined, logger, failShell, failShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBeDefined();
  });
});
