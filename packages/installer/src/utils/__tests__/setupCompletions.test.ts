import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { BaseInstallContext, ToolConfig } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { setupCompletions } from '../setupCompletions';

describe('setupCompletions', () => {
  const logger = new TestLogger({ name: 'test' });
  const extractDir = '/tmp/extract';
  const shellScriptsDir = '/home/user/.dotfiles/shell';
  
  const mockContext: BaseInstallContext = {
    projectConfig: {
      paths: {
        shellScriptsDir,
      },
    },
  } as BaseInstallContext;

  it('should do nothing if toolConfig has no shellConfigs', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
    };

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    // No assertions needed, just ensuring no errors
  });

  it('should do nothing if shellConfig has no completions', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {},
      },
    };

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);
  });

  it('should symlink completion file from extractDir', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {
          completions: {
            source: 'completion.zsh',
          },
        },
      },
    };

    // Create source file
    const sourcePath = path.join(extractDir, 'completion.zsh');
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(sourcePath, '# completion');

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    const targetPath = path.join(shellScriptsDir, 'zsh', 'completions', '_test-tool');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(sourcePath);
  });

  it('should symlink completion file relative to config file if not in extractDir', async () => {
    const { fs } = await createMemFileSystem();
    const configFilePath = '/home/user/dotfiles/tools/test-tool.tool.ts';
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      configFilePath,
      shellConfigs: {
        bash: {
          completions: {
            source: 'completions/bash',
          },
        },
      },
    };

    // Create source file relative to config
    const sourcePath = '/home/user/dotfiles/tools/completions/bash';
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, '# completion');

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    const targetPath = path.join(shellScriptsDir, 'bash', 'completions', '_test-tool');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(sourcePath);
  });

  it('should warn if completion source not found', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {
          completions: {
            source: 'missing.zsh',
          },
        },
      },
    };

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    const targetPath = path.join(shellScriptsDir, 'zsh', 'completions', '_test-tool');
    expect(await fs.exists(targetPath)).toBe(false);
    
    logger.expect(['WARN'], ['test', 'setupCompletions'], ['Completion file not found: /tmp/extract/missing.zsh']);
  });

  it('should use custom target name if provided', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {
          completions: {
            source: 'completion.zsh',
            name: 'custom-name',
          },
        },
      },
    };

    const sourcePath = path.join(extractDir, 'completion.zsh');
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(sourcePath, '# completion');

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    const targetPath = path.join(shellScriptsDir, 'zsh', 'completions', 'custom-name');
    expect(await fs.exists(targetPath)).toBe(true);
  });

  it('should use custom target directory if provided', async () => {
    const { fs } = await createMemFileSystem();
    const customDir = '/custom/completions';
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {
          completions: {
            source: 'completion.zsh',
            targetDir: customDir,
          },
        },
      },
    };

    const sourcePath = path.join(extractDir, 'completion.zsh');
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(sourcePath, '# completion');

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    const targetPath = path.join(customDir, '_test-tool');
    expect(await fs.exists(targetPath)).toBe(true);
  });

  it('should replace existing symlink', async () => {
    const { fs } = await createMemFileSystem();
    const toolConfig: ToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      installationMethod: 'manual',
      shellConfigs: {
        zsh: {
          completions: {
            source: 'completion.zsh',
          },
        },
      },
    };

    const sourcePath = path.join(extractDir, 'completion.zsh');
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(sourcePath, '# completion');

    const targetPath = path.join(shellScriptsDir, 'zsh', 'completions', '_test-tool');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, 'old-link'); // Simulate existing file/link

    await setupCompletions(fs, 'test-tool', toolConfig, mockContext, extractDir, logger);

    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(sourcePath);
  });
});
