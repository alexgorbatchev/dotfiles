import { ConfigService, createProjectConfigFromObject } from '@dotfiles/config';
import type { InstallerPluginRegistry } from '@dotfiles/core';
import { NodeFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import type { IInstaller } from '@dotfiles/installer';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { createMockSystemInfo, createMockVersionChecker } from '../../testing-helpers';
import { createDashboardServer } from '../dashboard-server';
import { clearToolConfigsCache } from '../routes';
import type { IDashboardServer, IDashboardServices } from '../types';

describe('Dashboard server relative path resolution', () => {
  let logger: TestLogger;
  let registryDatabase: RegistryDatabase;
  let fileRegistry: FileRegistry;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let server: IDashboardServer;
  let baseUrl: string;
  let cleanupFn: (() => Promise<void>) | undefined;
  let originalCwd: string;

  beforeEach(async () => {
    clearToolConfigsCache();
    originalCwd = process.cwd();
    logger = new TestLogger();
    registryDatabase = new RegistryDatabase(logger, ':memory:');
    const db = registryDatabase.getConnection();
    fileRegistry = new FileRegistry(logger, db);
    toolInstallationRegistry = new ToolInstallationRegistry(logger, db);

    const realFs = new NodeFileSystem();
    const systemInfo = createMockSystemInfo();
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'dashboard-relative-tool-configs',
    });
    const configDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      await realFs.rm(configDir, { recursive: true, force: true });
    };

    const configPath = path.join(configDir, 'config.ts');
    const toolConfigPath = path.join(configDir, 'tools', 'test-tool.tool.ts');

    await realFs.mkdir(path.dirname(toolConfigPath), { recursive: true });
    await realFs.writeFile(
      toolConfigPath,
      `export default {
        name: 'test-tool',
        version: 'latest',
        installationMethod: 'manual',
        installParams: {},
        binaries: ['test-tool'],
      };`,
    );

    const projectConfig = await createProjectConfigFromObject(
      logger,
      realFs,
      {
        paths: {
          dotfilesDir: '.',
          generatedDir: './.generated',
          homeDir: '{HOME}',
          targetDir: './bin',
          toolConfigsDir: './tools',
          shellScriptsDir: './shell-scripts',
          binariesDir: './binaries',
        },
      },
      systemInfo,
      {},
      { userConfigPath: configPath },
    );

    const resolvedFs = new ResolvedFileSystem(realFs, projectConfig.paths.homeDir);
    const services: IDashboardServices = {
      projectConfig,
      fs: resolvedFs,
      configService: new ConfigService(),
      systemInfo,
      fileRegistry,
      toolInstallationRegistry,
      versionChecker: createMockVersionChecker(),
      downloader: {
        registerStrategy: () => {},
        download: async () => undefined,
        downloadToFile: async () => {},
      },
      installer: {
        install: async () => ({ success: true as const, version: '1.0.0', installationMethod: 'manual' }),
      } as unknown as IInstaller,
      pluginRegistry: {
        get: () => undefined,
      } as unknown as InstallerPluginRegistry,
    };

    const port = 10000 + Math.floor(Math.random() * 50000);
    server = createDashboardServer(logger, services, { port, host: 'localhost' });
    await server.start();
    baseUrl = server.getUrl();

    expect(projectConfig.paths.toolConfigsDir).toBe(path.join(configDir, 'tools'));
  });

  afterEach(async () => {
    await server.stop();
    registryDatabase.close();
    process.chdir(originalCwd);
    await cleanupFn?.();
    cleanupFn = undefined;
  });

  test('serves tool configs after the server changes the process cwd', async () => {
    const response = await fetch(`${baseUrl}/api/tools`);
    const result = await response.json();

    assert(result.success);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].config.name).toBe('test-tool');
  });
});
