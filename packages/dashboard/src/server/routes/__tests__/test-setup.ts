import type { IConfigService } from "@dotfiles/config";
import type { InstallerPluginRegistry, ToolConfig } from "@dotfiles/core";
import { createMemFileSystem, type IResolvedFileSystem } from "@dotfiles/file-system";
import type { IInstaller } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { FileRegistry } from "@dotfiles/registry/file";
import { ToolInstallationRegistry } from "@dotfiles/registry/tool";
import { mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createMockConfigService,
  createMockProjectConfig,
  createMockSystemInfo,
  createMockToolConfig,
  createMockVersionChecker,
} from "../../../testing-helpers";
import type { IDashboardServices } from "../../types";
import { clearToolConfigsCache, createApiRoutes } from "../index";

type MockToolConfigInput = Partial<ToolConfig> & {
  name: string;
};

export interface ITestContext {
  logger: TestLogger;
  registryDatabase: RegistryDatabase;
  fileRegistry: FileRegistry;
  toolInstallationRegistry: ToolInstallationRegistry;
  services: IDashboardServices;
  api: ReturnType<typeof createApiRoutes>;
  fs: IResolvedFileSystem;
  toolConfigs: Record<string, ToolConfig>;
  configService: IConfigService;
  mockInstaller: { install: ReturnType<typeof mock> };
  mockPluginRegistry: { get: ReturnType<typeof mock> };
}

export type TestContext = ITestContext;

export async function setupTestContext(): Promise<ITestContext> {
  clearToolConfigsCache();
  const logger = new TestLogger();
  const registryDatabase = new RegistryDatabase(logger, ":memory:");
  const db = registryDatabase.getConnection();
  const fileRegistry = new FileRegistry(logger, db);
  const toolInstallationRegistry = new ToolInstallationRegistry(logger, db);

  const memFileSystem = await createMemFileSystem();
  const fs = memFileSystem.fs.asIResolvedFileSystem;

  const toolConfigs: Record<string, ToolConfig> = {};
  const configService = createMockConfigService(toolConfigs);

  const mockInstaller = {
    install: mock(async () => ({
      success: true as const,
      version: "1.0.0",
      installationMethod: "github-release",
    })),
  };

  const mockPluginRegistry = {
    get: mock(() => undefined),
  };

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
    installer: mockInstaller as unknown as IInstaller,
    pluginRegistry: mockPluginRegistry as unknown as InstallerPluginRegistry,
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
    mockInstaller,
    mockPluginRegistry,
  };
}

export function createMockToolConfigForTests(overrides: MockToolConfigInput): ToolConfig {
  return createMockToolConfig(overrides);
}

export { randomUUID };
