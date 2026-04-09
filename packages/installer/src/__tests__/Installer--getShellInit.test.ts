import { raw, type ToolConfig } from "@dotfiles/core";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import { createInstallerTestSetup, type IInstallerTestSetup, MOCK_TOOL_NAME } from "./installer-test-helpers";

describe("Installer - getShellInit for already-installed tools", () => {
  let setup: IInstallerTestSetup;

  async function createHealthyExistingInstall(version: string): Promise<void> {
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, version);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);
  }

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should call plugin.getShellInit when tool is already installed", async () => {
    const toolConfig: ToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {
        repo: "owner/repo",
      },
    };

    await createHealthyExistingInstall("1.0.0");

    // Mock that tool is already installed
    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01"),
      toolName: MOCK_TOOL_NAME,
      version: "1.0.0",
      installPath: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "1.0.0"),
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current", MOCK_TOOL_NAME)],
    });

    // Mock getShellInit on the plugin by directly assigning
    const mockShellInit = {
      zsh: {
        scripts: [raw('source "/path/to/plugin.zsh"')],
      },
    };

    const plugin = setup.pluginRegistry.get("github-release");
    assert(plugin, "Plugin should exist");

    const getShellInitMock = mock(() => mockShellInit);
    plugin.getShellInit = getShellInitMock;

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(result.shellInit).toEqual(mockShellInit);
    expect(getShellInitMock).toHaveBeenCalledWith(
      MOCK_TOOL_NAME,
      expect.objectContaining({ name: MOCK_TOOL_NAME }),
      expect.stringContaining("current"),
    );

    // Clean up
    plugin.getShellInit = undefined;
  });

  it("should return undefined shellInit when plugin does not implement getShellInit", async () => {
    const toolConfig: ToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {
        repo: "owner/repo",
      },
    };

    await createHealthyExistingInstall("1.0.0");

    // Mock that tool is already installed
    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01"),
      toolName: MOCK_TOOL_NAME,
      version: "1.0.0",
      installPath: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "1.0.0"),
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current", MOCK_TOOL_NAME)],
    });

    // Plugin's getShellInit is undefined by default for github-release
    const plugin = setup.pluginRegistry.get("github-release");
    assert(plugin, "Plugin should exist");

    // Ensure getShellInit is not defined (default for github-release)
    const originalGetShellInit = plugin.getShellInit;
    plugin.getShellInit = undefined;

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(result.shellInit).toBeUndefined();

    // Restore
    plugin.getShellInit = originalGetShellInit;
  });

  it("should include shellInit in already-installed result when version is latest", async () => {
    const toolConfig: ToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: "latest",
      installationMethod: "github-release",
      installParams: {
        repo: "owner/repo",
      },
    };

    await createHealthyExistingInstall("2.0.0");

    // Mock that tool is already installed (any version counts for 'latest')
    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01"),
      toolName: MOCK_TOOL_NAME,
      version: "2.0.0",
      installPath: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "2.0.0"),
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current", MOCK_TOOL_NAME)],
    });

    const mockShellInit = {
      zsh: {
        scripts: [raw('eval "$(tool init zsh)"')],
      },
    };

    const plugin = setup.pluginRegistry.get("github-release");
    assert(plugin, "Plugin should exist");

    const getShellInitMock = mock(() => mockShellInit);
    plugin.getShellInit = getShellInitMock;

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(result.success).toBe(true);
    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(result.shellInit).toEqual(mockShellInit);

    // Clean up
    plugin.getShellInit = undefined;
  });
});
