import type { ProjectConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import { always, Architecture, Platform } from '@dotfiles/core';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { IGenerateShellInitOptions } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';

describe('ShellInitGenerator - Configurable Profiles', () => {
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;
  let configFilePath: string;

  const toolConfigs: Record<string, ToolConfig> = {
    testTool: {
      name: 'testTool',
      binaries: ['tt'],
      version: '1.0.0',
      shellConfigs: { zsh: { scripts: [always(`export TEST_VAR="hello"`)] } },
      installationMethod: 'manual',
      installParams: {},
    },
  };

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-configurable-profiles' });

    configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
  });

  it('should use custom profile path when configured', async () => {
    const customZshrc = path.join(testDirs.paths.homeDir, '.my_custom_zshrc');
    await mockFileSystem.ensureDir(path.dirname(customZshrc));
    await mockFileSystem.writeFile(customZshrc, '# Custom zsh config\n');

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
        features: {
          shellInstall: {
            zsh: '~/.my_custom_zshrc',
            bash: '~/.bashrc',
          },
        },
      },
      filePath: configFilePath,
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockProjectConfig);

    const options: IGenerateShellInitOptions = {
      shellTypes: ['zsh'],
      updateProfileFiles: true,
    };

    const result = await generator.generate(toolConfigs, options);

    expect(result?.profileUpdates).toBeDefined();
    const update = result?.profileUpdates?.find((u) => u.shellType === 'zsh');

    expect(update?.profilePath).toBe(customZshrc);
    expect(update?.wasUpdated).toBe(true);

    const content = await mockFileSystem.readFile(customZshrc);
    expect(content).toContain('source "');
  });

  it('should skip shell update if configuration is missing for that shell', async () => {
    // Create default zshrc to ensure it's NOT updated
    const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
    await mockFileSystem.ensureDir(path.dirname(zshrcPath));
    await mockFileSystem.writeFile(zshrcPath, '# Existing zsh config\n');

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
        features: {
          shellInstall: {
            // zsh is missing/undefined
            bash: '~/.bashrc',
          },
        },
      },
      filePath: configFilePath,
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockProjectConfig);

    const options: IGenerateShellInitOptions = {
      shellTypes: ['zsh'],
      updateProfileFiles: true,
    };

    const result = await generator.generate(toolConfigs, options);

    // Should be empty because zsh was skipped
    expect(result?.profileUpdates).toEqual([]);

    const content = await mockFileSystem.readFile(zshrcPath);
    expect(content).toBe('# Existing zsh config\n');
  });

  it('should skip all updates if shellInstall is undefined (opt-in behavior)', async () => {
    const zshrcPath = path.join(testDirs.paths.homeDir, '.zshrc');
    await mockFileSystem.ensureDir(path.dirname(zshrcPath));
    await mockFileSystem.writeFile(zshrcPath, '# Existing zsh config\n');

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
        features: {
          // shellInstall is undefined
        },
      },
      filePath: configFilePath,
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockProjectConfig);

    const options: IGenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash'],
      updateProfileFiles: true,
    };

    const result = await generator.generate(toolConfigs, options);

    expect(result?.profileUpdates).toEqual([]);
  });
});
