import type { IInstallContext, Shell } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import assert from 'node:assert';
import { installFromBrew } from '../installFromBrew';
import type { BrewToolConfig } from '../schemas';
import { createMockShell } from './helpers/mocks';

function createMockFileSystem(): IFileSystem {
  return {
    ensureDir: mock(() => Promise.resolve()),
    exists: mock(() => Promise.resolve(false)),
    rm: mock(() => Promise.resolve()),
    symlink: mock(() => Promise.resolve()),
  } as unknown as IFileSystem;
}

function createMockContext(toolConfig: BrewToolConfig, mockShell: Shell): IInstallContext {
  return {
    projectConfig: {
      paths: {
        binariesDir: '/bin',
        shellScriptsDir: '/scripts',
        dotfilesDir: '/dotfiles',
        generatedDir: '/generated',
        homeDir: '/home',
        targetDir: '/generated/bin-default',
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
    fileSystem: createMockFileSystem(),
    toolConfig,
  } as unknown as IInstallContext;
}

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
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew('test-tool', toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
    expect(result.metadata.formula).toBe('test-tool');
  });

  it('should fall back to brew info for version when versionArgs provided but no binaries', async () => {
    const toolConfig: BrewToolConfig = {
      name: 'test-tool',
      version: '1.2.3',
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
        versionArgs: ['--version'],
        versionRegex: 'version (\\d+\\.\\d+\\.\\d+)',
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew('test-tool', toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
  });

  it('should not create symlinks when no binaries are defined', async () => {
    const toolConfig: BrewToolConfig = {
      name: 'test-tool',
      version: '1.2.3',
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew('test-tool', toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);

    const fs = context.fileSystem;
    expect(fs.symlink).not.toHaveBeenCalled();
  });
});
