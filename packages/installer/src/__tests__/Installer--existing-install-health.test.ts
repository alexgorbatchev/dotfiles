import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import type { AptToolConfig } from "@dotfiles/installer-apt";
import type { DnfToolConfig } from "@dotfiles/installer-dnf";
import type { NpmToolConfig } from "@dotfiles/installer-npm";
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  type IInstallerTestSetup,
  MOCK_TOOL_NAME,
  MOCK_TOOL_VERSION,
} from "./installer-test-helpers";

describe("Installer - existing install health", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should reinstall when the current binary is missing from an existing installation", async () => {
    const toolConfig = createGithubReleaseToolConfig();
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [path.join(currentDir, MOCK_TOOL_NAME)],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install").mockImplementation(
      async (_parentLogger, _method, _toolName, _config, context) => {
        const binaryPath = path.join(context.stagingDir, MOCK_TOOL_NAME);
        await setup.fs.ensureDir(path.dirname(binaryPath));
        await setup.fs.writeFile(binaryPath, "mock binary content");
        await setup.fs.chmod(binaryPath, 0o755);

        return {
          success: true,
          binaryPaths: [binaryPath],
          version: MOCK_TOOL_VERSION,
          originalTag: `v${MOCK_TOOL_VERSION}`,
          metadata: {
            method: "github-release",
            releaseUrl: `https://github.com/owner/repo/releases/tag/v${MOCK_TOOL_VERSION}`,
            publishedAt: "2025-01-01T00:00:00.000Z",
            releaseName: `Release v${MOCK_TOOL_VERSION}`,
            downloadUrl: "https://github.com/owner/repo/releases/download/v1.0.0/test-tool.tar.gz",
            assetName: "test-tool.tar.gz",
          },
        };
      },
    );

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("github-release");
    expect(installSpy).toHaveBeenCalled();
  });

  it("should skip reinstall when the existing installation payload is healthy", async () => {
    const toolConfig = createGithubReleaseToolConfig();
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install");

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should reinstall when install params target a different explicit version", async () => {
    const toolConfig: AptToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "latest",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "apt",
      installParams: {
        package: MOCK_TOOL_NAME,
        version: "2.0.0-1",
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install").mockResolvedValue({
      success: true,
      binaryPaths: [currentBinaryPath],
      version: "2.0.0-1",
      metadata: {
        method: "apt",
        packageName: MOCK_TOOL_NAME,
      },
    });

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("apt");
    expect(installSpy).toHaveBeenCalled();
  });

  it("should prefer apt install params version over top-level tool version", async () => {
    const toolConfig: AptToolConfig = {
      name: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "apt",
      installParams: {
        package: MOCK_TOOL_NAME,
        version: "2.0.0-1",
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install").mockResolvedValue({
      success: true,
      binaryPaths: [currentBinaryPath],
      version: "2.0.0-1",
      metadata: {
        method: "apt",
        packageName: MOCK_TOOL_NAME,
      },
    });

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("apt");
    expect(installSpy).toHaveBeenCalled();
  });

  it("should not treat top-level apt version as an exact package version", async () => {
    const toolConfig: AptToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "2.0.0-1",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "apt",
      installParams: {
        package: MOCK_TOOL_NAME,
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install");

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should reinstall when dnf install params target a different exact version", async () => {
    const toolConfig: DnfToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "latest",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "dnf",
      installParams: {
        package: MOCK_TOOL_NAME,
        version: "2.0.0-1.fc40",
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install").mockResolvedValue({
      success: true,
      binaryPaths: [currentBinaryPath],
      version: "2.0.0-1.fc40",
      metadata: {
        method: "dnf",
        packageName: MOCK_TOOL_NAME,
      },
    });

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("dnf");
    expect(installSpy).toHaveBeenCalled();
  });

  it("should compare normalized dnf epoch versions when checking existing installs", async () => {
    const toolConfig: DnfToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "latest",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "dnf",
      installParams: {
        package: MOCK_TOOL_NAME,
        version: "1:13.0.0-1.fc40",
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "1-13.0.0-1.fc40");
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: "1-13.0.0-1.fc40",
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install");

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should not treat npm version ranges as exact installed versions", async () => {
    const toolConfig: NpmToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "latest",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "npm",
      installParams: {
        package: MOCK_TOOL_NAME,
        version: "^1.0.0",
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install");

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should not treat top-level semver ranges as exact installed versions", async () => {
    const toolConfig: NpmToolConfig = {
      name: MOCK_TOOL_NAME,
      version: "^1.0.0",
      binaries: [MOCK_TOOL_NAME],
      installationMethod: "npm",
      installParams: {
        package: MOCK_TOOL_NAME,
      },
    };
    const installPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_VERSION);
    const currentDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");
    const currentBinaryPath = path.join(currentDir, MOCK_TOOL_NAME);

    await setup.fs.ensureDir(installPath);
    await setup.fs.ensureDir(currentDir);
    await setup.fs.writeFile(currentBinaryPath, "mock binary content");
    await setup.fs.chmod(currentBinaryPath, 0o755);

    setup.mockToolInstallationRegistry.getToolInstallation.mockResolvedValue({
      id: 1,
      installedAt: new Date("2025-01-01T00:00:00.000Z"),
      toolName: MOCK_TOOL_NAME,
      version: MOCK_TOOL_VERSION,
      installPath,
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: [currentBinaryPath],
    });

    const installSpy = spyOn(setup.pluginRegistry, "install");

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    assert(result.success);
    expect(result.installationMethod).toBe("already-installed");
    expect(installSpy).not.toHaveBeenCalled();
  });
});
