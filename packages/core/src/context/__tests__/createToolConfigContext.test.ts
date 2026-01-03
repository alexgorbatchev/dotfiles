import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type { IResolvedFileSystem, MockedFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig } from '@dotfiles/testing-helpers';
import { z } from 'zod';
import { Architecture, type ISystemInfo, Platform } from '../../common';
import { createToolConfigContext } from '../createToolConfigContext';

describe('createToolConfigContext', () => {
  let projectConfig: ProjectConfig;
  let fileSystem: MockedFileSystem;
  let resolvedFs: IResolvedFileSystem;

  const systemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
  };

  beforeEach(async () => {
    const logger = new TestLogger();
    const memFs = await createMemFileSystem();
    fileSystem = memFs.fs;
    resolvedFs = memFs.fs.asIResolvedFileSystem;
    await fileSystem.ensureDir('/test');

    projectConfig = await createMockProjectConfig({
      config: {
        paths: {
          homeDir: '/Users/testuser',
          dotfilesDir: '/Users/testuser/.dotfiles',
          generatedDir: '/Users/testuser/.dotfiles/.generated',
          targetDir: '/Users/testuser/.dotfiles/.generated/usr-local-bin',
          binariesDir: '/Users/testuser/.dotfiles/.generated/binaries',
          toolConfigsDir: '/Users/testuser/.dotfiles/configs/tools',
        },
      },
      filePath: '/test/config.yaml',
      fileSystem,
      logger,
      systemInfo,
      env: {},
    });
  });

  it('should expose currentDir and not expose legacy install directory key', () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs);

    const currentDirParsed = z.object({ currentDir: z.string() }).safeParse(context);
    expect(currentDirParsed.success).toBe(true);
    assert(currentDirParsed.success);

    const expectedCurrentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');
    expect(currentDirParsed.data.currentDir).toBe(expectedCurrentDir);

    const legacyKey = 'install' + 'Dir';
    const legacyShape: Record<string, z.ZodString> = { [legacyKey]: z.string() };
    const legacyParsed = z.object(legacyShape).safeParse(context);
    expect(legacyParsed.success).toBe(false);
  });

  it('should expose replaceInFile function that uses injected fileSystem', async () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs);

    expect(typeof context.replaceInFile).toBe('function');

    // Create a test file
    await fileSystem.ensureDir('/test/files');
    await fileSystem.writeFile('/test/files/config.txt', 'version=1\nname=test', 'utf8');

    // Use the context's replaceInFile with positional params
    await context.replaceInFile('/test/files/config.txt', /version=(\d+)/, 'version=2');

    const content = await fileSystem.readFile('/test/files/config.txt', 'utf8');
    expect(content).toBe('version=2\nname=test');
  });
});
