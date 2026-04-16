import type { InstallerPluginRegistry } from "@dotfiles/core";
import { createMemFileSystem, type IResolvedFileSystem } from "@dotfiles/file-system";
import type { IInstaller } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { createRotatedToolUsageLogName, getToolUsageLogDir, getToolUsageLogPath } from "@dotfiles/registry/tool";
import { FileRegistry } from "@dotfiles/registry/file";
import { ToolInstallationRegistry } from "@dotfiles/registry/tool";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import {
  createMockConfigService,
  createMockProjectConfig,
  createMockSystemInfo,
  createMockVersionChecker,
} from "../../testing-helpers";
import { createDashboardServer } from "../dashboard-server";
import { clearToolConfigsCache } from "../routes";
import type { IDashboardServer } from "../types";
import type { IDashboardServices } from "../types";

describe("Dashboard usage log import", () => {
  let logger: TestLogger;
  let registryDatabase: RegistryDatabase;
  let fileRegistry: FileRegistry;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let services: IDashboardServices;
  let fs: IResolvedFileSystem;
  let server: IDashboardServer | null;
  let originalCwd: string;

  beforeEach(async () => {
    clearToolConfigsCache();
    originalCwd = process.cwd();
    logger = new TestLogger();
    registryDatabase = new RegistryDatabase(logger, ":memory:");
    const db = registryDatabase.getConnection();
    fileRegistry = new FileRegistry(logger, db);
    toolInstallationRegistry = new ToolInstallationRegistry(logger, db);
    server = null;

    const memFs = await createMemFileSystem();
    fs = memFs.fs.asIResolvedFileSystem;

    services = {
      projectConfig: createMockProjectConfig(),
      fs,
      configService: createMockConfigService({}),
      systemInfo: createMockSystemInfo(),
      fileRegistry,
      toolInstallationRegistry,
      versionChecker: createMockVersionChecker(),
      downloader: {
        registerStrategy: () => {},
        download: async () => undefined,
        downloadToFile: async () => {},
      },
      installer: {
        install: async () => ({ success: true as const, version: "1.0.0", installationMethod: "manual" }),
      } as unknown as IInstaller,
      pluginRegistry: {
        get: () => undefined,
      } as unknown as InstallerPluginRegistry,
    };
  });

  afterEach(async () => {
    await server?.stop();
    server = null;
    process.chdir(originalCwd);
    registryDatabase.close();
  });

  test("imports the active usage log when the dashboard starts", async () => {
    const usageLogDir = getToolUsageLogDir(services.projectConfig);
    const usageLogPath = getToolUsageLogPath(services.projectConfig);
    const firstUsedAt = new Date("2026-04-16T12:34:56.000Z");
    const secondUsedAt = new Date("2026-04-16T12:35:56.000Z");

    await fs.ensureDir(usageLogDir);
    await fs.writeFile(
      usageLogPath,
      [
        `1\t${Math.floor(firstUsedAt.getTime() / 1000)}\trg\trg`,
        `1\t${Math.floor(secondUsedAt.getTime() / 1000)}\trg\trg`,
        `1\t${Math.floor(secondUsedAt.getTime() / 1000)}\tnode\tnpm`,
      ].join("\n"),
    );

    const port = 10000 + Math.floor(Math.random() * 50000);
    server = createDashboardServer(logger, services, { port, host: "localhost" });

    await server.start();

    const rgUsage = await toolInstallationRegistry.getToolUsage("rg", "rg");
    const npmUsage = await toolInstallationRegistry.getToolUsage("node", "npm");

    expect(rgUsage?.usageCount).toBe(2);
    expect(rgUsage?.lastUsedAt.toISOString()).toBe(secondUsedAt.toISOString());
    expect(npmUsage?.usageCount).toBe(1);
    expect(await fs.exists(usageLogPath)).toBe(false);
    expect(await fs.readdir(usageLogDir)).toEqual([]);
  });

  test("imports rotated usage logs left behind from an earlier startup", async () => {
    const usageLogDir = getToolUsageLogDir(services.projectConfig);
    const rotatedName = createRotatedToolUsageLogName(1713273296000, 42);
    const rotatedPath = path.join(usageLogDir, rotatedName);
    const usedAt = new Date("2026-04-16T12:34:56.000Z");

    await fs.ensureDir(usageLogDir);
    await fs.writeFile(rotatedPath, `1\t${Math.floor(usedAt.getTime() / 1000)}\tbat\tbat`);

    const port = 10000 + Math.floor(Math.random() * 50000);
    server = createDashboardServer(logger, services, { port, host: "localhost" });

    await server.start();

    const usage = await toolInstallationRegistry.getToolUsage("bat", "bat");
    expect(usage?.usageCount).toBe(1);
    expect(usage?.lastUsedAt.toISOString()).toBe(usedAt.toISOString());
    expect(await fs.exists(rotatedPath)).toBe(false);
  });
});
