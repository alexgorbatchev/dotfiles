import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig } from '@dotfiles/testing-helpers';
import { z } from 'zod';
import { Architecture, type ISystemInfo, Platform } from '../../common';
import { createToolConfigContext } from '../createToolConfigContext';

describe('createToolConfigContext', () => {
  let projectConfig: ProjectConfig;

  const systemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
  };

  beforeEach(async () => {
    const logger = new TestLogger();
    const memFs = await createMemFileSystem();
    await memFs.fs.ensureDir('/test');

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
      fileSystem: memFs.fs,
      logger,
      systemInfo,
      env: {},
    });
  });

  it('should expose currentDir and not expose legacy install directory key', () => {
    const toolName = 'test-tool';
    const toolDir = '/tmp/tools/test-tool';

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir);

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
});
