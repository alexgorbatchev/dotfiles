import type { IConfigService } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { randomUUID } from 'node:crypto';
import {
  createMockConfigService,
  createMockProjectConfig,
  createMockSystemInfo,
  createMockToolConfig,
  createMockVersionChecker,
} from '../../../testing-helpers';
import type { IDashboardServices } from '../../types';
import { clearToolConfigsCache, createApiRoutes } from '../index';

export interface TestContext {
  logger: TestLogger;
  registryDatabase: RegistryDatabase;
  fileRegistry: FileRegistry;
  toolInstallationRegistry: ToolInstallationRegistry;
  services: IDashboardServices;
  api: ReturnType<typeof createApiRoutes>;
  fs: IResolvedFileSystem;
  toolConfigs: Record<string, ToolConfig>;
  configService: IConfigService;
}

export async function setupTestContext(): Promise<TestContext> {
  clearToolConfigsCache();
  const logger = new TestLogger();
  const registryDatabase = new RegistryDatabase(logger, ':memory:');
  const db = registryDatabase.getConnection();
  const fileRegistry = new FileRegistry(logger, db);
  const toolInstallationRegistry = new ToolInstallationRegistry(logger, db);

  const memFs = await createMemFileSystem();
  const fs = memFs.fs.asIResolvedFileSystem;

  const toolConfigs: Record<string, ToolConfig> = {};
  const configService = createMockConfigService(toolConfigs);

  const services: IDashboardServices = {
    projectConfig: createMockProjectConfig(),
    fs,
    configService,
    systemInfo: createMockSystemInfo(),
    fileRegistry,
    toolInstallationRegistry,
    versionChecker: createMockVersionChecker(),
    downloader: {
      registerStrategy: () => {},
      download: async () => undefined,
      downloadToFile: async () => {},
    },
  };

  const api = createApiRoutes(logger, services);

  return {
    logger,
    registryDatabase,
    fileRegistry,
    toolInstallationRegistry,
    services,
    api,
    fs,
    toolConfigs,
    configService,
  };
}

export function createMockToolConfigForTests(overrides: Partial<ToolConfig> & { name: string; }): ToolConfig {
  return createMockToolConfig(overrides);
}

export { randomUUID };
