import { TestLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { ToolInstallationRegistry } from "@dotfiles/registry/tool";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";

describe("Installer Integration - Tool Installation Registry", () => {
  let logger: TestLogger;
  let toolInstallationRegistry: ToolInstallationRegistry;
  let registryDatabase: RegistryDatabase;
  let dbPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    dbPath = path.join("/tmp", `test-installer-registry-${randomUUID()}.db`);
    registryDatabase = new RegistryDatabase(logger, dbPath);
    toolInstallationRegistry = new ToolInstallationRegistry(logger, registryDatabase.getConnection());
  });

  afterEach(async () => {
    await toolInstallationRegistry.close();
    registryDatabase.close();
    try {
      await unlink(dbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should record and retrieve tool installation", async () => {
    const toolName = "test-tool";
    const version = "1.0.0";

    // Before installation, tool should not be in registry
    const beforeInstall = await toolInstallationRegistry.getToolInstallation(toolName);
    expect(beforeInstall).toBeNull();

    // Record a tool installation
    await toolInstallationRegistry.recordToolInstallation({
      toolName,
      version,
      installPath: "binaries/test-tool/2025-08-13-20-32-49",
      timestamp: "2025-08-13-20-32-49",
      binaryPaths: ["binaries/test-tool/test-tool"],
      downloadUrl: "https://example.com/test-tool.tar.gz",
      assetName: "test-tool.tar.gz",
      configuredVersion: "latest",
    });

    // Tool should now be in registry
    const afterInstall = await toolInstallationRegistry.getToolInstallation(toolName);
    expect(afterInstall).not.toBeNull();
    expect(afterInstall?.toolName).toBe(toolName);
    expect(afterInstall?.version).toBe(version);
    expect(afterInstall?.binaryPaths).toEqual(["binaries/test-tool/test-tool"]);
  });

  test("should check if tool is installed", async () => {
    const toolName = "existing-tool";
    const version = "1.0.0";

    // Tool should not be installed initially
    expect(await toolInstallationRegistry.isToolInstalled(toolName)).toBe(false);
    expect(await toolInstallationRegistry.isToolInstalled(toolName, version)).toBe(false);

    // Record a tool installation
    await toolInstallationRegistry.recordToolInstallation({
      toolName,
      version,
      installPath: "binaries/existing-tool/2025-08-13-20-00-00",
      timestamp: "2025-08-13-20-00-00",
      binaryPaths: ["binaries/existing-tool/existing-tool"],
    });

    // Tool should now be installed
    expect(await toolInstallationRegistry.isToolInstalled(toolName)).toBe(true);
    expect(await toolInstallationRegistry.isToolInstalled(toolName, version)).toBe(true);
    expect(await toolInstallationRegistry.isToolInstalled(toolName, "2.0.0")).toBe(false);
  });

  test("should replace existing installation", async () => {
    const toolName = "upgrade-tool";

    // Record initial installation
    await toolInstallationRegistry.recordToolInstallation({
      toolName,
      version: "1.0.0",
      installPath: "binaries/upgrade-tool/2025-08-13-20-00-00",
      timestamp: "2025-08-13-20-00-00",
      binaryPaths: ["binaries/upgrade-tool/upgrade-tool"],
    });

    // Record upgrade
    await toolInstallationRegistry.recordToolInstallation({
      toolName,
      version: "2.0.0",
      installPath: "binaries/upgrade-tool/2025-08-13-21-00-00",
      timestamp: "2025-08-13-21-00-00",
      binaryPaths: ["binaries/upgrade-tool/upgrade-tool"],
    });

    // Should have the new version
    const installation = await toolInstallationRegistry.getToolInstallation(toolName);
    expect(installation?.version).toBe("2.0.0");
    expect(installation?.timestamp).toBe("2025-08-13-21-00-00");
  });
});
